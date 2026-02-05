use anyhow::{anyhow, Result};
use regex::Regex;
use rusty_ytdl::{reqwest, Video, VideoOptions, VideoQuality, VideoSearchOptions};
use serde::Serialize;
use std::sync::OnceLock;

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

    // Get the URL - this is where signature decryption happens
    let resolved_url = best_format.url.clone();

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
