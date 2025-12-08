/**
 * Main Process Entry Point for Electrobun Viewer
 * Initializes the main window and sets up IPC handlers
 */

import Electrobun, { BrowserWindow, BrowserView } from "electrobun/bun";
import { settingsManager } from "./settings-manager";
import {
  showOverlay,
  hideOverlay,
  toggleOverlay,
  updateSubtitle,
  updateOverlaySettings,
  setOverlayPosition,
  setOverlayPreset,
  setOverlaySize,
  setClickThrough,
  getOverlayState,
} from "./overlay-window";

// Store reference to main window
let mainWindow: BrowserWindow<any> | null = null;

// Handle deep link URLs (jutukuva://join/CODE)
let pendingSessionCode: string | null = null;

function handleDeepLink(url: string): void {
  console.log("[Main] Received deep link:", url);

  const match = url.match(/^jutukuva:\/\/join\/([A-Z0-9]+)$/i);
  if (match) {
    const sessionCode = match[1].toUpperCase();
    console.log("[Main] Session code:", sessionCode);

    if (mainWindow) {
      mainWindow.webview.rpc.send("deeplink:join", sessionCode);
    } else {
      pendingSessionCode = sessionCode;
    }
  }
}

/**
 * Create the main application window
 */
function createMainWindow(): void {
  const connectionSettings = settingsManager.getConnection();
  const theme = settingsManager.getTheme();

  console.log("[Main] Creating main window");

  // Set up RPC communication
  const rpc = BrowserView.defineRPC<any>({
    handlers: {
      requests: {
        // ═══════════════════════════════════════════════════════════════
        // Settings handlers
        // ═══════════════════════════════════════════════════════════════

        "settings:getAll": async () => {
          return settingsManager.getAll();
        },

        "settings:getOverlay": async () => {
          return settingsManager.getOverlay();
        },

        "settings:getFont": async () => {
          return settingsManager.getFont();
        },

        "settings:getConnection": async () => {
          return settingsManager.getConnection();
        },

        "settings:setOverlay": async (
          settings: Parameters<typeof settingsManager.setOverlay>[0]
        ) => {
          settingsManager.setOverlay(settings);
          return settingsManager.getOverlay();
        },

        "settings:setFont": async (
          settings: Parameters<typeof settingsManager.setFont>[0]
        ) => {
          settingsManager.setFont(settings);
          updateOverlaySettings(settings);
          return settingsManager.getFont();
        },

        "settings:setConnection": async (
          settings: Parameters<typeof settingsManager.setConnection>[0]
        ) => {
          settingsManager.setConnection(settings);
          return settingsManager.getConnection();
        },

        "settings:setTheme": async (theme: "light" | "dark" | "system") => {
          settingsManager.setTheme(theme);
          return theme;
        },

        "settings:reset": async () => {
          settingsManager.reset();
          return settingsManager.getAll();
        },

        // ═══════════════════════════════════════════════════════════════
        // Overlay handlers
        // ═══════════════════════════════════════════════════════════════

        "overlay:show": async () => {
          showOverlay();
          return getOverlayState();
        },

        "overlay:hide": async () => {
          hideOverlay();
          return getOverlayState();
        },

        "overlay:toggle": async () => {
          toggleOverlay();
          return getOverlayState();
        },

        "overlay:getState": async () => {
          return getOverlayState();
        },

        "overlay:updateSubtitle": async (text: string) => {
          updateSubtitle(text);
          return { success: true };
        },

        "overlay:setPosition": async (position: { x: number; y: number }) => {
          setOverlayPosition(position.x, position.y);
          return settingsManager.getOverlay();
        },

        "overlay:setPreset": async (
          preset: "top" | "bottom" | "center" | "custom"
        ) => {
          setOverlayPreset(preset);
          return settingsManager.getOverlay();
        },

        "overlay:setSize": async (size: { width: number; height: number }) => {
          setOverlaySize(size.width, size.height);
          return settingsManager.getOverlay();
        },

        "overlay:setClickThrough": async (enabled: boolean) => {
          setClickThrough(enabled);
          return settingsManager.getOverlay();
        },

        "overlay:updateSettings": async (
          settings: Parameters<typeof updateOverlaySettings>[0]
        ) => {
          updateOverlaySettings(settings);
          return getOverlayState();
        },

        // ═══════════════════════════════════════════════════════════════
        // Session handlers
        // ═══════════════════════════════════════════════════════════════

        "session:setLastCode": async (code: string | null) => {
          settingsManager.setLastSessionCode(code);
          return { success: true };
        },

        "session:getLastCode": async () => {
          return settingsManager.getLastSessionCode();
        },
      },
    },
  });

  mainWindow = new BrowserWindow({
    title: "Jutukuva Viewer",
    url: "views://main/index.html",
    frame: {
      width: 1200,
      height: 800,
      x: 100,
      y: 100,
    },
    titleBarStyle: "hiddenInset",
    styleMask: {
      Titled: true,
      Closable: true,
      Miniaturizable: true,
      Resizable: true,
      FullSizeContentView: true,
    },
    rpc,
  });

  // Handle window close
  mainWindow.on("close", () => {
    console.log("[Main] Main window closing");
    hideOverlay();
    mainWindow = null;
  });

  // Send pending deep link once window is ready
  if (pendingSessionCode) {
    setTimeout(() => {
      if (mainWindow) {
        mainWindow.webview.rpc.send("deeplink:join", pendingSessionCode);
        pendingSessionCode = null;
      }
    }, 1000);
  }

  console.log("[Main] Main window created");
}

// Initialize the application
console.log("[Main] Starting Jutukuva Viewer...");

// Create the main window
createMainWindow();

// Handle Electrobun lifecycle events
Electrobun.events.on("will-quit", () => {
  console.log("[Main] Application quitting");
  hideOverlay();
});

console.log("[Main] Jutukuva Viewer ready");
