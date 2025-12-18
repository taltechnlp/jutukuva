mod commands;
mod settings;
mod window_manager;

use commands::*;
use settings::{load_settings, AppSettings};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

pub struct AppState {
    pub settings: Mutex<AppSettings>,
    pub overlay_visible: Mutex<bool>,
}

fn show_main_window(app: &tauri::AppHandle) {
    // Hide overlay if exists
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }

    // Update state
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut visible) = state.overlay_visible.lock() {
            *visible = false;
        }
    }

    // Show main window
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
}

// Spawn overlay window creation on a separate thread to avoid WebView2 deadlock
fn spawn_show_overlay_window(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let state = match app.try_state::<AppState>() {
            Some(s) => s,
            None => return,
        };

        let overlay_settings = match state.settings.lock() {
            Ok(s) => s.overlay.clone(),
            Err(_) => return,
        };

        // Hide main window first
        if let Some(main_window) = app.get_webview_window("main") {
            let _ = main_window.hide();
        }

        // Create or show overlay window
        if app.get_webview_window("overlay").is_none() {
            if let Err(e) = window_manager::create_overlay_window(&app, &overlay_settings) {
                log::error!("Failed to create overlay window: {}", e);
                // Show main window again on failure
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.show();
                }
                return;
            }
        } else {
            let _ = window_manager::show_overlay_window(&app);
        }

        // Update state
        {
            if let Ok(mut visible) = state.overlay_visible.lock() {
                *visible = true;
            };
        }
    });
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
                        // When overlay is closed directly, show main window and update state
                        let app = window.app_handle();
                        show_main_window(&app);
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
            // Create system tray menu
            let show_main_item = MenuItem::with_id(app, "show_main", "Näita peaaken", true, None::<&str>)?;
            let show_overlay_item = MenuItem::with_id(app, "show_overlay", "Näita ülekatet", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Välju", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_main_item, &show_overlay_item, &quit_item])?;

            // Load tray icon
            let icon = Image::from_path("icons/32x32.png")
                .or_else(|_| Image::from_path("icons/icon.ico"))
                .unwrap_or_else(|_| Image::from_bytes(include_bytes!("../icons/32x32.png")).unwrap());

            // Create system tray
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Jutukuva Subtiitrid")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show_main" => {
                            show_main_window(app);
                        }
                        "show_overlay" => {
                            // Spawn on separate thread to avoid WebView2 deadlock
                            spawn_show_overlay_window(app.clone());
                        }
                        "quit" => {
                            // Close all windows and exit
                            if let Some(overlay) = app.get_webview_window("overlay") {
                                let _ = overlay.close();
                            }
                            if let Some(main_window) = app.get_webview_window("main") {
                                let _ = main_window.close();
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Click on tray icon shows main window
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        show_main_window(&app);
                    }
                })
                .build(app)?;

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
