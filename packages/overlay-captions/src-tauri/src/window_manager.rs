use crate::settings::OverlaySettings;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn create_overlay_window(app: &AppHandle, settings: &OverlaySettings) -> Result<(), String> {
    // Check if overlay window already exists
    if app.get_webview_window("overlay").is_some() {
        log::info!("Overlay window already exists, skipping creation");
        return Ok(());
    }

    let overlay_url = WebviewUrl::App("/overlay".into());

    log::info!("Creating overlay window with settings: position=({}, {}), size=({}, {}), always_on_top={}",
        settings.position.x, settings.position.y,
        settings.size.width, settings.size.height,
        settings.always_on_top);

    #[cfg(target_os = "macos")]
    let builder = WebviewWindowBuilder::new(app, "overlay", overlay_url)
        .title("Captions")
        .inner_size(settings.size.width as f64, settings.size.height as f64)
        .position(settings.position.x as f64, settings.position.y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(true)
        .visible_on_all_workspaces(true);

    // Windows: Don't use transparent(true) as WebView2 has issues with it.
    // Instead, use an opaque window and apply transparency via CSS in the frontend.
    // Main window is hidden before this is called to avoid WebView2 deadlock.
    #[cfg(target_os = "windows")]
    let builder = WebviewWindowBuilder::new(app, "overlay", overlay_url)
        .title("Captions")
        .inner_size(settings.size.width as f64, settings.size.height as f64)
        .position(settings.position.x as f64, settings.position.y as f64)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(true);

    #[cfg(target_os = "linux")]
    let builder = WebviewWindowBuilder::new(app, "overlay", overlay_url)
        .title("Captions")
        .inner_size(settings.size.width as f64, settings.size.height as f64)
        .position(settings.position.x as f64, settings.position.y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    // Explicitly set always on top after window creation (helps on some Linux WMs)
    window
        .set_always_on_top(true)
        .map_err(|e| e.to_string())?;

    log::info!("Overlay window created successfully");

    // Apply click-through if enabled
    if settings.click_through {
        set_ignore_cursor_events(app, true)?;
    }

    Ok(())
}

pub fn close_overlay_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn show_overlay_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn hide_overlay_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn set_ignore_cursor_events(app: &AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window
            .set_ignore_cursor_events(ignore)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn set_overlay_position(app: &AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn set_overlay_size(app: &AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
