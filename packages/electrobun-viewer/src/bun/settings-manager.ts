/**
 * Settings Manager for Electrobun Viewer
 * Handles persistent storage of user preferences using JSON file
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface OverlaySettings {
  enabled: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  positionPreset: "top" | "bottom" | "center" | "custom";
  opacity: number;
  clickThrough: boolean;
  alwaysOnTop: boolean;
}

export interface FontSettings {
  family: string;
  size: number;
  weight: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
}

export interface ConnectionSettings {
  yjsServerUrl: string;
  webViewerUrl: string;
  autoConnect: boolean;
}

export interface AppSettings {
  overlay: OverlaySettings;
  font: FontSettings;
  connection: ConnectionSettings;
  lastSessionCode: string | null;
  theme: "light" | "dark" | "system";
}

const DEFAULT_SETTINGS: AppSettings = {
  overlay: {
    enabled: false,
    position: { x: 100, y: 100 },
    size: { width: 800, height: 160 },
    positionPreset: "bottom",
    opacity: 0.95,
    clickThrough: false,
    alwaysOnTop: false,
  },
  font: {
    family: "Inter, system-ui, sans-serif",
    size: 32,
    weight: 500,
    color: "#ffffff",
    backgroundColor: "#1a1a1a",
    backgroundOpacity: 0.85,
  },
  connection: {
    yjsServerUrl: "ws://localhost:1234",
    webViewerUrl: "http://localhost:5174",
    autoConnect: true,
  },
  lastSessionCode: null,
  theme: "system",
};

class SettingsManager {
  private settings: AppSettings;
  private settingsPath: string;

  constructor() {
    // Store settings in user's app data directory
    const appDataDir = join(homedir(), ".jutukuva-viewer");
    if (!existsSync(appDataDir)) {
      mkdirSync(appDataDir, { recursive: true });
    }
    this.settingsPath = join(appDataDir, "settings.json");
    this.settings = this.loadSettings();
  }

  private loadSettings(): AppSettings {
    try {
      if (existsSync(this.settingsPath)) {
        const data = readFileSync(this.settingsPath, "utf-8");
        const parsed = JSON.parse(data);
        // Merge with defaults to ensure all fields exist
        return this.mergeWithDefaults(parsed);
      }
    } catch (error) {
      console.error("[Settings] Error loading settings:", error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private mergeWithDefaults(partial: Partial<AppSettings>): AppSettings {
    return {
      overlay: { ...DEFAULT_SETTINGS.overlay, ...partial.overlay },
      font: { ...DEFAULT_SETTINGS.font, ...partial.font },
      connection: { ...DEFAULT_SETTINGS.connection, ...partial.connection },
      lastSessionCode:
        partial.lastSessionCode ?? DEFAULT_SETTINGS.lastSessionCode,
      theme: partial.theme ?? DEFAULT_SETTINGS.theme,
    };
  }

  private saveSettings(): void {
    try {
      writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error("[Settings] Error saving settings:", error);
    }
  }

  // Getters
  getAll(): AppSettings {
    return { ...this.settings };
  }

  getOverlay(): OverlaySettings {
    return { ...this.settings.overlay };
  }

  getFont(): FontSettings {
    return { ...this.settings.font };
  }

  getConnection(): ConnectionSettings {
    return { ...this.settings.connection };
  }

  getTheme(): "light" | "dark" | "system" {
    return this.settings.theme;
  }

  getLastSessionCode(): string | null {
    return this.settings.lastSessionCode;
  }

  // Setters
  setOverlay(overlay: Partial<OverlaySettings>): void {
    this.settings.overlay = { ...this.settings.overlay, ...overlay };
    this.saveSettings();
  }

  setFont(font: Partial<FontSettings>): void {
    this.settings.font = { ...this.settings.font, ...font };
    this.saveSettings();
  }

  setConnection(connection: Partial<ConnectionSettings>): void {
    this.settings.connection = { ...this.settings.connection, ...connection };
    this.saveSettings();
  }

  setTheme(theme: "light" | "dark" | "system"): void {
    this.settings.theme = theme;
    this.saveSettings();
  }

  setLastSessionCode(code: string | null): void {
    this.settings.lastSessionCode = code;
    this.saveSettings();
  }

  // Bulk update
  updateAll(settings: Partial<AppSettings>): void {
    if (settings.overlay)
      this.settings.overlay = { ...this.settings.overlay, ...settings.overlay };
    if (settings.font)
      this.settings.font = { ...this.settings.font, ...settings.font };
    if (settings.connection)
      this.settings.connection = {
        ...this.settings.connection,
        ...settings.connection,
      };
    if (settings.theme) this.settings.theme = settings.theme;
    if (settings.lastSessionCode !== undefined)
      this.settings.lastSessionCode = settings.lastSessionCode;
    this.saveSettings();
  }

  // Reset to defaults
  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
  }
}

// Export singleton instance
export const settingsManager = new SettingsManager();
