use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub enabled: bool,
    pub position: Position,
    pub size: Size,
    pub position_preset: String,
    pub opacity: f32,
    pub click_through: bool,
    pub always_on_top: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FontSettings {
    pub family: String,
    pub size: u32,
    pub weight: u32,
    pub color: String,
    pub background_color: String,
    pub background_opacity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSettings {
    pub yjs_server_url: String,
    pub auto_connect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub overlay: OverlaySettings,
    pub font: FontSettings,
    pub connection: ConnectionSettings,
    pub last_session_code: Option<String>,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            overlay: OverlaySettings {
                enabled: false,
                position: Position { x: 100, y: 100 },
                size: Size {
                    width: 800,
                    height: 160,
                },
                position_preset: "bottom".to_string(),
                opacity: 0.95,
                click_through: false,
                always_on_top: true,
            },
            font: FontSettings {
                family: "Inter, system-ui, sans-serif".to_string(),
                size: 32,
                weight: 500,
                color: "#ffffff".to_string(),
                background_color: "#1a1a1a".to_string(),
                background_opacity: 0.85,
            },
            connection: ConnectionSettings {
                yjs_server_url: "wss://tekstiks.ee/kk".to_string(),
                auto_connect: true,
            },
            last_session_code: None,
            theme: "system".to_string(),
        }
    }
}

pub fn get_settings_path() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("ee", "jutukuva", "overlay-captions") {
        let config_dir = proj_dirs.config_dir();
        fs::create_dir_all(config_dir).ok();
        config_dir.join("settings.json")
    } else {
        PathBuf::from("settings.json")
    }
}

pub fn load_settings() -> AppSettings {
    let path = get_settings_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}
