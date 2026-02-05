//! Standalone test for ytdlp-ejs
//! 
//! Usage: cargo run --example test_ytdlp_ejs

use ytdlp_ejs::{
    process_input, JsChallengeInput, JsChallengeOutput, JsChallengeRequest, 
    JsChallengeResponse, JsChallengeType, RuntimeType,
    test_data::{get_player_paths, TEST_CASES},
};

fn main() {
    println!("=== ytdlp-ejs Standalone Test ===\n");

    // Test 1: Use a known test case from ytdlp-ejs
    println!("Test 1: Using known test case from ytdlp-ejs test_data");
    if let Some(test_case) = TEST_CASES.first() {
        println!("  Player ID: {}", test_case.player);
        if let Some(n_test) = test_case.n.first() {
            println!("  N input: {}", n_test.input);
            println!("  N expected: {}", n_test.expected);
        }
    }

    // Test 2: Download a real player.js and test
    println!("\nTest 2: Downloading real player.js from YouTube");
    
    // First, get a video page to extract the current player ID
    let video_id = "dQw4w9WgXcQ";
    let watch_url = format!("https://www.youtube.com/watch?v={}", video_id);
    
    println!("  Fetching watch page: {}", watch_url);
    
    let html = match fetch_url(&watch_url) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("  Failed to fetch watch page: {}", e);
            return;
        }
    };
    
    // Extract player ID from HTML
    let player_id = extract_player_id(&html);
    println!("  Extracted player ID: {:?}", player_id);
    
    let player_id = match player_id {
        Some(id) => id,
        None => {
            eprintln!("  Could not extract player ID from HTML");
            // Try with a known working player from test cases
            if let Some(tc) = TEST_CASES.first() {
                println!("  Falling back to test case player: {}", tc.player);
                tc.player.to_string()
            } else {
                return;
            }
        }
    };
    
    // Get player paths
    let paths = get_player_paths();
    let main_path = paths.get("main").unwrap_or(&"player_ias.vflset/en_US/base.js");
    
    let player_url = format!(
        "https://www.youtube.com/s/player/{}/{}",
        player_id, main_path
    );
    
    println!("  Fetching player.js: {}", player_url);
    
    let player_code = match fetch_url(&player_url) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("  Failed to fetch player.js: {}", e);
            return;
        }
    };
    
    println!("  Player.js size: {} bytes", player_code.len());
    
    // Test 3: Try to decode an n-param
    println!("\nTest 3: Testing n-param decoding");
    
    // Use a sample n-param (you'd get this from a real video URL)
    let test_n = "abcdefghijklmnop";
    
    let input = JsChallengeInput::Player {
        player: player_code.clone(),
        requests: vec![
            JsChallengeRequest {
                challenge_type: JsChallengeType::N,
                challenges: vec![test_n.to_string()],
            },
        ],
        output_preprocessed: true, // Get preprocessed output for debugging
    };
    
    println!("  Processing with QuickJS runtime...");
    let output = process_input(input, RuntimeType::QuickJS);
    
    match output {
        JsChallengeOutput::Result { responses, preprocessed_player } => {
            println!("  SUCCESS!");
            if let Some(pre) = preprocessed_player {
                println!("  Preprocessed player: {} chars", pre.len());
            }
            for response in responses {
                match response {
                    JsChallengeResponse::Result { data } => {
                        println!("  Results: {:?}", data);
                    }
                    JsChallengeResponse::Error { error } => {
                        println!("  Response error: {}", error);
                    }
                }
            }
        }
        JsChallengeOutput::Error { error } => {
            eprintln!("  FAILED: {}", error);
        }
    }
    
    // Test 4: Try with a known working test case player
    println!("\nTest 4: Testing with known test case player");
    if let Some(test_case) = TEST_CASES.first() {
        let paths = get_player_paths();
        let main_path = paths.get("main").unwrap();
        let url = format!(
            "https://www.youtube.com/s/player/{}/{}",
            test_case.player, main_path
        );
        
        println!("  Fetching known player: {}", url);
        
        if let Ok(code) = fetch_url(&url) {
            println!("  Player size: {} bytes", code.len());
            
            if let Some(n_test) = test_case.n.first() {
                let input = JsChallengeInput::Player {
                    player: code,
                    requests: vec![
                        JsChallengeRequest {
                            challenge_type: JsChallengeType::N,
                            challenges: vec![n_test.input.to_string()],
                        },
                    ],
                    output_preprocessed: false,
                };
                
                let output = process_input(input, RuntimeType::QuickJS);
                
                match output {
                    JsChallengeOutput::Result { responses, .. } => {
                        for response in responses {
                            if let JsChallengeResponse::Result { data } = response {
                                if let Some(result) = data.get(n_test.input) {
                                    println!("  Input: {}", n_test.input);
                                    println!("  Output: {}", result);
                                    println!("  Expected: {}", n_test.expected);
                                    println!("  Match: {}", result == n_test.expected);
                                }
                            }
                        }
                    }
                    JsChallengeOutput::Error { error } => {
                        eprintln!("  FAILED: {}", error);
                    }
                }
            }
        } else {
            eprintln!("  Failed to fetch known player (may be expired)");
        }
    }
}

fn fetch_url(url: &str) -> Result<String, String> {
    let output = std::process::Command::new("curl")
        .args([
            "-sL",
            "--connect-timeout", "10",
            "--max-time", "30",
            "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            url,
        ])
        .output()
        .map_err(|e| format!("curl failed: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("curl error: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    String::from_utf8(output.stdout)
        .map_err(|e| format!("UTF-8 error: {}", e))
}

fn extract_player_id(html: &str) -> Option<String> {
    // Look for /s/player/XXXXXXXX/ pattern
    let re = regex::Regex::new(r"/s/player/([a-f0-9]{8})/").ok()?;
    re.captures(html)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}
