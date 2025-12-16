use crate::settings::{self, AppSettings};
use crate::window_manager;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct CaptionPayload {
    pub text: String,
}

// Settings commands
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    new_settings: AppSettings,
) -> Result<(), String> {
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    *settings = new_settings.clone();
    settings::save_settings(&new_settings)
}

#[tauri::command]
pub fn reset_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    *settings = AppSettings::default();
    settings::save_settings(&settings)?;
    Ok(settings.clone())
}

// Overlay window commands
#[tauri::command]
pub fn show_overlay(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;

    // Create or show the overlay window
    if app.get_webview_window("overlay").is_none() {
        window_manager::create_overlay_window(&app, &settings.overlay)?;
    } else {
        window_manager::show_overlay_window(&app)?;
    }

    let mut overlay_visible = state.overlay_visible.lock().map_err(|e| e.to_string())?;
    *overlay_visible = true;

    Ok(())
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    window_manager::hide_overlay_window(&app)?;

    let mut overlay_visible = state.overlay_visible.lock().map_err(|e| e.to_string())?;
    *overlay_visible = false;

    Ok(())
}

#[tauri::command]
pub fn close_overlay(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    window_manager::close_overlay_window(&app)?;

    let mut overlay_visible = state.overlay_visible.lock().map_err(|e| e.to_string())?;
    *overlay_visible = false;

    Ok(())
}

#[tauri::command]
pub fn toggle_overlay(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    let is_visible = {
        let overlay_visible = state.overlay_visible.lock().map_err(|e| e.to_string())?;
        *overlay_visible
    };

    if is_visible {
        hide_overlay(app, state)?;
        Ok(false)
    } else {
        show_overlay(app, state)?;
        Ok(true)
    }
}

#[tauri::command]
pub fn set_overlay_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    window_manager::set_overlay_position(&app, x, y)
}

#[tauri::command]
pub fn set_overlay_size(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    window_manager::set_overlay_size(&app, width, height)
}

#[tauri::command]
pub fn set_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    window_manager::set_ignore_cursor_events(&app, enabled)
}

#[tauri::command]
pub fn get_overlay_visible(state: State<'_, AppState>) -> Result<bool, String> {
    let overlay_visible = state.overlay_visible.lock().map_err(|e| e.to_string())?;
    Ok(*overlay_visible)
}

// Session commands
#[tauri::command]
pub fn set_last_session_code(
    state: State<'_, AppState>,
    code: Option<String>,
) -> Result<(), String> {
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    settings.last_session_code = code;
    settings::save_settings(&settings)
}

#[tauri::command]
pub fn get_last_session_code(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.last_session_code.clone())
}

// Caption broadcast command - emits to all windows via Rust backend
#[tauri::command]
pub fn broadcast_caption(app: AppHandle, text: String) -> Result<(), String> {
    log::info!("[broadcast_caption] Broadcasting: {}", if text.len() > 50 { &text[..50] } else { &text });
    app.emit("caption-update", CaptionPayload { text: text.clone() })
        .map_err(|e| {
            log::error!("[broadcast_caption] Failed to emit: {}", e);
            e.to_string()
        })
}

// Show main window and open settings
#[tauri::command]
pub fn show_main_with_settings(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        // Emit event to open settings drawer
        app.emit_to("main", "open-settings", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Close the entire application properly
#[tauri::command]
pub fn close_app(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    log::info!("close_app command called");

    // Close overlay window if it exists
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.close();
    }

    // Update state
    {
        let mut overlay_visible = state.overlay_visible.lock().map_err(|e| e.to_string())?;
        *overlay_visible = false;
    }

    // Close main window
    if let Some(main_window) = app.get_webview_window("main") {
        main_window.close().map_err(|e| e.to_string())?;
    }

    // Exit the app
    app.exit(0);

    Ok(())
}
