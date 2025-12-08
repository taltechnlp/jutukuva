/**
 * Overlay Window Manager for Electrobun Viewer
 * Manages the always-on-top subtitle overlay window
 */

import { BrowserWindow, BrowserView } from "electrobun/bun";
import {
  settingsManager,
  type OverlaySettings,
  type FontSettings,
} from "./settings-manager";

let overlayWindow: BrowserWindow<any> | null = null;
let currentSubtitle = "";

/**
 * Get the style mask for overlay window based on settings
 */
function getOverlayStyleMask(settings: OverlaySettings) {
  return {
    Borderless: true,
    Titled: false,
    Closable: false,
    Miniaturizable: false,
    Resizable: true,
    UnifiedTitleAndToolbar: false,
    FullScreen: false,
    FullSizeContentView: true,
    UtilityWindow: true,
    DocModalWindow: false,
    NonactivatingPanel: settings.clickThrough,
    HUDWindow: false,
  };
}

/**
 * Calculate position based on preset
 */
function calculatePosition(
  preset: OverlaySettings["positionPreset"],
  size: { width: number; height: number }
): { x: number; y: number } {
  // Default screen dimensions (will be adjusted by actual screen size)
  const screenWidth = 1920;
  const screenHeight = 1080;

  switch (preset) {
    case "top":
      return { x: (screenWidth - size.width) / 2, y: 50 };
    case "bottom":
      return {
        x: (screenWidth - size.width) / 2,
        y: screenHeight - size.height - 100,
      };
    case "center":
      return {
        x: (screenWidth - size.width) / 2,
        y: (screenHeight - size.height) / 2,
      };
    case "custom":
    default:
      return settingsManager.getOverlay().position;
  }
}

/**
 * Create and show the overlay window
 */
export function showOverlay(): void {
  if (overlayWindow) {
    console.log("[Overlay] Window already exists");
    return;
  }

  const overlaySettings = settingsManager.getOverlay();
  const fontSettings = settingsManager.getFont();

  const position =
    overlaySettings.positionPreset === "custom"
      ? overlaySettings.position
      : calculatePosition(overlaySettings.positionPreset, overlaySettings.size);

  console.log("[Overlay] Creating overlay window at", position);

  // Set up RPC for overlay window (no request handlers, only messages)
  const overlayRpc = BrowserView.defineRPC<any>({
    handlers: {
      requests: {},
    },
  });

  overlayWindow = new BrowserWindow({
    title: "Subtitles",
    url: "views://overlay/index.html",
    frame: {
      width: overlaySettings.size.width,
      height: overlaySettings.size.height,
      x: position.x,
      y: position.y,
    },
    styleMask: getOverlayStyleMask(overlaySettings),
    rpc: overlayRpc,
  });

  // Send initial settings to overlay
  overlayWindow.webview.rpc.send("overlay:settings", {
    font: fontSettings,
    opacity: overlaySettings.opacity,
    subtitle: currentSubtitle,
  });

  // Update settings to show overlay is enabled
  settingsManager.setOverlay({ enabled: true });

  console.log("[Overlay] Window created");
}

/**
 * Hide and destroy the overlay window
 */
export function hideOverlay(): void {
  if (!overlayWindow) {
    console.log("[Overlay] No window to hide");
    return;
  }

  overlayWindow.close();
  overlayWindow = null;
  settingsManager.setOverlay({ enabled: false });

  console.log("[Overlay] Window closed");
}

/**
 * Toggle overlay visibility
 */
export function toggleOverlay(): boolean {
  if (overlayWindow) {
    hideOverlay();
    return false;
  } else {
    showOverlay();
    return true;
  }
}

/**
 * Update the subtitle text displayed in overlay
 */
export function updateSubtitle(text: string): void {
  currentSubtitle = text;

  if (overlayWindow) {
    overlayWindow.webview.rpc.send("overlay:subtitle", text);
  }
}

/**
 * Update overlay settings (font, colors, etc.)
 */
export function updateOverlaySettings(
  settings: Partial<FontSettings & { opacity?: number }>
): void {
  if (settings.opacity !== undefined) {
    settingsManager.setOverlay({ opacity: settings.opacity });
  }

  const fontUpdate: Partial<FontSettings> = {};
  if (settings.family) fontUpdate.family = settings.family;
  if (settings.size) fontUpdate.size = settings.size;
  if (settings.weight) fontUpdate.weight = settings.weight;
  if (settings.color) fontUpdate.color = settings.color;
  if (settings.backgroundColor)
    fontUpdate.backgroundColor = settings.backgroundColor;
  if (settings.backgroundOpacity)
    fontUpdate.backgroundOpacity = settings.backgroundOpacity;

  if (Object.keys(fontUpdate).length > 0) {
    settingsManager.setFont(fontUpdate);
  }

  // Update overlay if visible
  if (overlayWindow) {
    overlayWindow.webview.rpc.send("overlay:settings", {
      font: settingsManager.getFont(),
      opacity: settingsManager.getOverlay().opacity,
      subtitle: currentSubtitle,
    });
  }
}

/**
 * Update overlay position
 */
export function setOverlayPosition(x: number, y: number): void {
  settingsManager.setOverlay({ position: { x, y }, positionPreset: "custom" });

  // Note: Electrobun may not support moving windows after creation
  // If needed, we would recreate the window at new position
  console.log("[Overlay] Position updated to", x, y);
}

/**
 * Set overlay position preset
 */
export function setOverlayPreset(
  preset: OverlaySettings["positionPreset"]
): void {
  const size = settingsManager.getOverlay().size;
  const position = calculatePosition(preset, size);

  settingsManager.setOverlay({ positionPreset: preset, position });

  // Recreate overlay at new position if visible
  if (overlayWindow) {
    hideOverlay();
    showOverlay();
  }
}

/**
 * Update overlay size
 */
export function setOverlaySize(width: number, height: number): void {
  settingsManager.setOverlay({ size: { width, height } });
  console.log("[Overlay] Size updated to", width, height);
}

/**
 * Toggle click-through mode
 */
export function setClickThrough(enabled: boolean): void {
  settingsManager.setOverlay({ clickThrough: enabled });

  // Recreate overlay with new settings if visible
  if (overlayWindow) {
    hideOverlay();
    showOverlay();
  }
}

/**
 * Check if overlay is currently visible
 */
export function isOverlayVisible(): boolean {
  return overlayWindow !== null;
}

/**
 * Get current overlay state
 */
export function getOverlayState() {
  return {
    visible: isOverlayVisible(),
    settings: settingsManager.getOverlay(),
    font: settingsManager.getFont(),
    currentSubtitle,
  };
}
