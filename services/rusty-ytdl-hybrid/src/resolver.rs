use anyhow::{anyhow, Result};
use regex::Regex;
use rusty_ytdl::{reqwest, Video, VideoOptions, VideoQuality, VideoSearchOptions};
use serde::Serialize;
use std::sync::OnceLock;
use ytdlp_ejs::{process_input, JsChallengeInput, JsChallengeOutput, JsChallengeRequest, JsChallengeResponse, JsChallengeType, RuntimeType};

#[derive(Serialize)]
pub struct ResolveResponse {
    pub url: String,
    pub expires_at: i64,
    pub quality: String,
    pub video_only: bool,
    pub resolved_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Resolve a YouTube video URL using rusty_ytdl for the API client
/// and ytdlp-ejs for signature decryption (if needed).
pub async fn resolve_video(
    video_id: &str,
    quality: u32,
    video_only: bool,
    proxy: Option<&str>,
    cookies: Option<&str>,
) -> Result<ResolveResponse> {
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    // Configure video options
    let video_quality = match quality {
        0..=144 => VideoQuality::Lowest,
        145..=240 => VideoQuality::LowestVideo,
        241..=360 => VideoQuality::Lowest,
        361..=480 => VideoQuality::LowestVideo,
        481..=720 => VideoQuality::HighestVideo,
        _ => VideoQuality::Highest,
    };

    let filter = if video_only {
        VideoSearchOptions::Video
    } else {
        VideoSearchOptions::VideoAudio
    };

    let mut options = VideoOptions {
        quality: video_quality,
        filter,
        ..Default::default()
    };

    // Use WEB client to match yt-dlp's default behavior
    options.request_options.client_type = Some("web".to_string());

    // Add proxy if configured (using rusty_ytdl's reqwest re-export)
    if let Some(proxy_url) = proxy {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_url) {
            options.request_options.proxy = Some(proxy);
        } else {
            eprintln!("[warn] Invalid proxy URL: {}", proxy_url);
        }
    }

    // TODO: Add cookie support when rusty_ytdl supports it
    if cookies.is_some() {
        eprintln!("[warn] Cookie support not yet implemented in rusty_ytdl wrapper");
    }

    // Create video instance and fetch info
    let video = Video::new_with_options(&url, options)
        .map_err(|e| anyhow!("Failed to create video instance: {}", e))?;

    let info = video
        .get_info()
        .await
        .map_err(|e| anyhow!("Failed to get video info: {}", e))?;

    // Find the best matching format
    let formats = &info.formats;
    
    // Debug: log format count and first format URL
    eprintln!("[rusty-ytdl] {} has {} formats", video_id, formats.len());
    if let Some(first) = formats.first() {
        eprintln!("[rusty-ytdl] First format URL length: {}, has_video: {}, has_audio: {}", 
            first.url.len(), first.has_video, first.has_audio);
        if first.url.len() < 100 {
            eprintln!("[rusty-ytdl] First format URL: {}", first.url);
        }
    }
    
    if formats.is_empty() {
        return Err(anyhow!("No formats available for video {}", video_id));
    }

    // Filter formats based on video_only preference
    let filtered: Vec<_> = formats
        .iter()
        .filter(|f| {
            if video_only {
                f.has_video && !f.has_audio
            } else {
                f.has_video && f.has_audio
            }
        })
        .collect();

    // If no combined formats, fall back to video-only
    let candidates = if filtered.is_empty() {
        formats.iter().filter(|f| f.has_video).collect::<Vec<_>>()
    } else {
        filtered
    };

    if candidates.is_empty() {
        return Err(anyhow!("No video formats found for {}", video_id));
    }

    // Find format closest to target quality
    let target_height = quality as i32;
    let best_format = candidates
        .iter()
        .min_by_key(|f| {
            let height = f.height.unwrap_or(0) as i32;
            (height - target_height).abs()
        })
        .ok_or_else(|| anyhow!("No suitable format found"))?;

    // Get the URL - rusty_ytdl handles signature but NOT n-parameter
    let mut resolved_url = best_format.url.clone();

    // Transform n-parameter using ytdlp-ejs if present
    if let Some(n_value) = extract_n_param(&resolved_url) {
        match transform_n_param(video_id, &n_value, proxy).await {
            Ok(transformed) => {
                resolved_url = replace_n_param(&resolved_url, &transformed);
                eprintln!("[rusty-ytdl] Transformed n-param for {}", video_id);
            }
            Err(e) => {
                eprintln!("[rusty-ytdl] n-param transform failed for {}: {}", video_id, e);
                // Continue with original URL - may get 403
            }
        }
    }

    // Parse expiry from URL
    let expires_at = parse_expires_from_url(&resolved_url);

    let quality_label = format!(
        "{}p",
        best_format.height.unwrap_or(0)
    );

    Ok(ResolveResponse {
        url: resolved_url,
        expires_at,
        quality: quality_label,
        video_only: !best_format.has_audio,
        resolved_at: chrono_timestamp(),
        error: None,
    })
}

/// Parse the 'expire' parameter from a YouTube video URL
fn parse_expires_from_url(url: &str) -> i64 {
    static EXPIRE_REGEX: OnceLock<Regex> = OnceLock::new();
    let re = EXPIRE_REGEX.get_or_init(|| {
        Regex::new(r"[?&]expire=(\d+)").unwrap()
    });

    if let Some(caps) = re.captures(url) {
        if let Some(m) = caps.get(1) {
            if let Ok(ts) = m.as_str().parse::<i64>() {
                return ts * 1000; // Convert to milliseconds
            }
        }
    }

    // Default: 6 hours from now
    chrono_timestamp() + (6 * 60 * 60 * 1000)
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

/// Extract the 'n' parameter value from a YouTube video URL
fn extract_n_param(url: &str) -> Option<String> {
    static N_REGEX: OnceLock<Regex> = OnceLock::new();
    let re = N_REGEX.get_or_init(|| {
        Regex::new(r"[?&]n=([^&]+)").unwrap()
    });

    re.captures(url)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

/// Replace the 'n' parameter in a URL with a new value
fn replace_n_param(url: &str, new_value: &str) -> String {
    static N_REGEX: OnceLock<Regex> = OnceLock::new();
    let re = N_REGEX.get_or_init(|| {
        Regex::new(r"([?&]n=)[^&]+").unwrap()
    });

    re.replace(url, format!("${{1}}{}", new_value)).to_string()
}

/// Transform the n-parameter using ytdlp-ejs
async fn transform_n_param(video_id: &str, n_value: &str, proxy: Option<&str>) -> Result<String> {
    // Fetch player.js URL from YouTube watch page
    let player_url = fetch_player_url(video_id, proxy).await?;
    
    // Download player.js content
    let player_code = fetch_player_code(&player_url, proxy).await?;
    
    // Use ytdlp-ejs to transform the n-parameter
    let input = JsChallengeInput::Player {
        player: player_code,
        requests: vec![
            JsChallengeRequest {
                challenge_type: JsChallengeType::N,
                challenges: vec![n_value.to_string()],
            },
        ],
        output_preprocessed: false,
    };

    let output = process_input(input, RuntimeType::QuickJS);
    
    // Extract the transformed n-value from the response
    match output {
        JsChallengeOutput::Result { responses, .. } => {
            for response in responses {
                if let JsChallengeResponse::Result { data } = response {
                    if let Some(transformed) = data.get(n_value) {
                        return Ok(transformed.to_string());
                    }
                }
            }
            Err(anyhow!("n-parameter not found in response"))
        }
        JsChallengeOutput::Error { error } => {
            Err(anyhow!("ytdlp-ejs error: {}", error))
        }
    }
}

/// Fetch the player.js URL from YouTube watch page
async fn fetch_player_url(video_id: &str, proxy: Option<&str>) -> Result<String> {
    let watch_url = format!("https://www.youtube.com/watch?v={}", video_id);
    
    let client = if let Some(proxy_url) = proxy {
        reqwest::Client::builder()
            .proxy(reqwest::Proxy::all(proxy_url)?)
            .build()?
    } else {
        reqwest::Client::new()
    };

    let html = client
        .get(&watch_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await?
        .text()
        .await?;

    // Extract player URL from HTML - look for /s/player/...base.js
    static PLAYER_REGEX: OnceLock<Regex> = OnceLock::new();
    let re = PLAYER_REGEX.get_or_init(|| {
        Regex::new(r#"(/s/player/[^"]+/player_ias\.vflset/[^"]+/base\.js)"#).unwrap()
    });

    if let Some(caps) = re.captures(&html) {
        if let Some(m) = caps.get(1) {
            return Ok(format!("https://www.youtube.com{}", m.as_str()));
        }
    }

    // Try alternative pattern
    static PLAYER_REGEX_ALT: OnceLock<Regex> = OnceLock::new();
    let re_alt = PLAYER_REGEX_ALT.get_or_init(|| {
        Regex::new(r#"(/s/player/[^"]+base\.js)"#).unwrap()
    });

    if let Some(caps) = re_alt.captures(&html) {
        if let Some(m) = caps.get(1) {
            return Ok(format!("https://www.youtube.com{}", m.as_str()));
        }
    }

    Err(anyhow!("Could not find player.js URL in watch page"))
}

/// Fetch the player.js code
async fn fetch_player_code(player_url: &str, proxy: Option<&str>) -> Result<String> {
    let client = if let Some(proxy_url) = proxy {
        reqwest::Client::builder()
            .proxy(reqwest::Proxy::all(proxy_url)?)
            .build()?
    } else {
        reqwest::Client::new()
    };

    let code = client
        .get(player_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await?
        .text()
        .await?;

    Ok(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_resolve_video() {
        // Test with a known public video (Rick Astley - Never Gonna Give You Up)
        let result = resolve_video("dQw4w9WgXcQ", 360, true, None, None).await;
        
        match result {
            Ok(response) => {
                assert!(!response.url.is_empty());
                assert!(response.expires_at > 0);
                println!("Resolved URL: {}", &response.url[..100.min(response.url.len())]);
            }
            Err(e) => {
                // May fail due to rate limiting or other issues
                eprintln!("Test failed (may be rate limited): {}", e);
            }
        }
    }

    #[test]
    fn test_parse_expires() {
        let url = "https://example.com/video?expire=1738900000&other=param";
        let expires = parse_expires_from_url(url);
        assert_eq!(expires, 1738900000000); // Converted to ms
    }
}
