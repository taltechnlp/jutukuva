mod commands;
mod settings;
mod window_manager;

use commands::*;
use settings::{load_settings, AppSettings};
use std::sync::Mutex;
use tauri::{Emitter, Manager, WindowEvent};

pub struct AppState {
    pub settings: Mutex<AppSettings>,
    pub overlay_visible: Mutex<bool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        settings: Mutex::new(load_settings()),
        overlay_visible: Mutex::new(false),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            reset_settings,
            show_overlay,
            hide_overlay,
            close_overlay,
            toggle_overlay,
            set_overlay_position,
            set_overlay_size,
            set_click_through,
            get_overlay_visible,
            set_last_session_code,
            get_last_session_code,
            broadcast_caption,
            show_main_with_settings,
            close_app,
        ])
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { .. } => {
                    let label = window.label();
                    log::info!("CloseRequested event for window: {}", label);

                    if label == "main" {
                        // When main window closes, also close the overlay
                        let app = window.app_handle();

                        // Close overlay window if it exists
                        if let Some(overlay) = app.get_webview_window("overlay") {
                            let _ = overlay.close();
                        }

                        // Update state
                        if let Some(state) = app.try_state::<AppState>() {
                            if let Ok(mut visible) = state.overlay_visible.lock() {
                                *visible = false;
                            }
                        }
                    } else if label == "overlay" {
                        // When overlay is closed directly, update state
                        let app = window.app_handle();
                        if let Some(state) = app.try_state::<AppState>() {
                            if let Ok(mut visible) = state.overlay_visible.lock() {
                                *visible = false;
                            }
                        }
                    }
                }
                WindowEvent::Destroyed => {
                    let label = window.label();
                    log::info!("Window destroyed: {}", label);

                    if label == "main" {
                        // Ensure app exits when main window is destroyed
                        let app = window.app_handle();
                        app.exit(0);
                    }
                }
                _ => {}
            }
        })
        .setup(|app| {
            // Register global shortcut for overlay toggle (Ctrl+Shift+O)
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

            let shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyO);

            let handle = app.handle().clone();
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    let _ = handle.emit("toggle-overlay", ());
                })
                .ok();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
