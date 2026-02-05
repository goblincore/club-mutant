use anyhow::Result;
use clap::Parser;
use serde::Serialize;
use std::time::Instant;

mod resolver;

#[derive(Parser, Debug)]
#[command(name = "rusty-ytdl-hybrid")]
#[command(about = "Fast YouTube video URL resolver using rusty_ytdl + ytdlp-ejs")]
struct Args {
    /// YouTube video ID to resolve
    #[arg(short, long)]
    resolve: String,

    /// Target quality (144, 240, 360, 480, 720, 1080)
    #[arg(short, long, default_value = "360")]
    quality: u32,

    /// Video-only (no audio track)
    #[arg(long, default_value = "false")]
    video_only: bool,

    /// Proxy URL (e.g., http://user:pass@host:port)
    #[arg(long)]
    proxy: Option<String>,

    /// Path to cookies file (Netscape format)
    #[arg(long)]
    cookies: Option<String>,

    /// Output timing information to stderr
    #[arg(long, default_value = "false")]
    timing: bool,
}

#[derive(Serialize)]
struct ResolveResponse {
    url: String,
    expires_at: i64,
    quality: String,
    video_only: bool,
    resolved_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let start = Instant::now();

    let result = resolver::resolve_video(
        &args.resolve,
        args.quality,
        args.video_only,
        args.proxy.as_deref(),
        args.cookies.as_deref(),
    )
    .await;

    let elapsed = start.elapsed();

    if args.timing {
        eprintln!("[timing] Total resolve time: {:?}", elapsed);
    }

    match result {
        Ok(response) => {
            println!("{}", serde_json::to_string_pretty(&response)?);
            Ok(())
        }
        Err(e) => {
            let error_response = ResolveResponse {
                url: String::new(),
                expires_at: 0,
                quality: String::new(),
                video_only: args.video_only,
                resolved_at: chrono_timestamp(),
                error: Some(e.to_string()),
            };
            println!("{}", serde_json::to_string_pretty(&error_response)?);
            std::process::exit(1);
        }
    }
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}
