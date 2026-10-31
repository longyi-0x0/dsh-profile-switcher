//! Native window host for `dsh-profile-switcher`.
//!
//! The plugin starts this program with the target profile's authenticated URL on **stdin**
//! and the profile name as `--title <name>`. It opens one tao window hosting one wry
//! WebView: a real application window, not a browser tab.
//!
//! The URL carries the profile's bearer token, so it never appears in argv: `ps` shows the
//! command line of every local process. Navigation stays on the target's origin; anything
//! else goes to the system browser instead of turning this window into a free browser.

use std::io::{self, Read};
use std::process::Command;

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::WindowBuilder;
use wry::{NewWindowResponse, WebViewBuilder};

const DEFAULT_TITLE: &str = "DeepSeek Harness";

/// @param args - process arguments. @returns the value after `--title`, when present.
fn title_from_args(args: &[String]) -> Option<String> {
    let index = args.iter().position(|arg| arg == "--title")?;
    args.get(index + 1).cloned().filter(|value| !value.is_empty())
}

/// @param url - absolute http(s) URL. @returns `scheme://host[:port]`, or an empty string.
fn origin_of(url: &str) -> String {
    let Some(scheme_end) = url.find("://") else {
        return String::new();
    };
    let rest = &url[scheme_end + 3..];
    let end = rest
        .find(['/', '?', '#'])
        .unwrap_or(rest.len());
    format!("{}{}", &url[..scheme_end + 3], &rest[..end])
}

/// @param target - navigation target. @param entry - URL the window was opened with.
/// @returns whether the WebView may navigate there.
fn same_origin(target: &str, entry: &str) -> bool {
    let entry_origin = origin_of(entry);
    !entry_origin.is_empty() && (target == "about:blank" || origin_of(target) == entry_origin)
}

/// Hand one URL to the system browser.
///
/// @param url - external URL.
fn open_external(url: &str) {
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", ""]);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");

    if let Err(error) = command.arg(url).spawn() {
        eprintln!("dsh-profile-window: could not hand {url} to the browser: {error}");
    }
}

fn main() -> anyhow::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let url = input.trim().to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        anyhow::bail!("expected an http(s) URL on stdin");
    }

    let title = title_from_args(&std::env::args().collect::<Vec<_>>())
        .unwrap_or_else(|| DEFAULT_TITLE.to_string());
    let event_loop = EventLoop::new();

    let window = WindowBuilder::new()
        .with_title(title)
        .with_inner_size(LogicalSize::new(1360.0, 900.0))
        .with_min_inner_size(LogicalSize::new(720.0, 520.0))
        .build(&event_loop)?;

    let entry = url.clone();
    let _view = WebViewBuilder::new()
        .with_url(&url)
        .with_navigation_handler(move |target| same_origin(&target, &entry))
        .with_new_window_req_handler(|target, _features| {
            open_external(&target);
            NewWindowResponse::Deny
        })
        .build(&window)?;

    event_loop.run(move |event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });
}
