import Electrobun, { BrowserView, BrowserWindow, Tray } from "electrobun/bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { AppRPCSchema, OverlaySettings } from "../shared/rpc";

const SETTINGS_PATH = join(
  process.env.HOME ?? process.cwd(),
  ".jutukuva-viewer-settings.json"
);

const DEFAULT_VIEWER_URL =
  process.env.VIEWER_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:5178/kk"
    : "https://tekstiks.ee/kk");

const defaultSettings: OverlaySettings = {
  fontSize: 32,
  textColor: "#FFFFFF",
  background: "rgba(0, 0, 0, 0.75)",
  alignment: "center",
  maxLines: 3,
  viewerUrl: DEFAULT_VIEWER_URL,
};

let settings: OverlaySettings = loadSettings();

let mainWindow: BrowserWindow<typeof rpc> | null = null;
let overlayWindow: BrowserWindow<typeof rpc> | null = null;
let tray: Tray | null = null;

const rpc = BrowserView.defineRPC<AppRPCSchema>({
  handlers: {
    requests: {
      toggleOverlay: ({ visible } = { visible: undefined }) => {
        const isVisible = toggleOverlayWindow(visible);
        return { visible: isVisible };
      },
      updateSettings: (partialSettings: Partial<OverlaySettings>) => {
        settings = {
          ...settings,
          ...partialSettings,
          overlayPosition: partialSettings.overlayPosition
            ? {
                ...settings.overlayPosition,
                ...partialSettings.overlayPosition,
              }
            : settings.overlayPosition,
        };
        saveSettings(settings);
        broadcastSettings();
        return settings;
      },
      joinSession: ({ code }: { code: string }) => {
        forwardJoinSession(code);
        return { code };
      },
      showMain: async () => {
        ensureMainWindow();
        mainWindow?.focus();
        return true;
      },
      pushSubtitles: ({ lines }: { lines: string[] }) => {
        sendSubtitles(lines);
        return true;
      },
    },
    messages: {
      overlayReady: () => {
        broadcastSettings();
        try {
          if (overlayWindow?.webview?.rpc) {
            overlayWindow.webview.rpc.send.overlayVisibility?.({
              visible: true,
            });
          }
        } catch (error) {
          console.warn("Failed to send overlay ready visibility:", error);
        }
      },
      requestSettings: () => {
        broadcastSettings();
      },
    },
  },
});

function loadSettings(): OverlaySettings {
  try {
    if (!existsSync(SETTINGS_PATH)) {
      return { ...defaultSettings };
    }
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch (error) {
    console.warn("Failed to read settings file, using defaults", error);
    return { ...defaultSettings };
  }
}

function saveSettings(nextSettings: OverlaySettings) {
  try {
    mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(nextSettings, null, 2), "utf8");
  } catch (error) {
    console.warn("Failed to persist settings", error);
  }
}

function ensureMainWindow() {
  if (mainWindow) {
    console.log("Main window already exists");
    return;
  }

  try {
    const viewerUrl = settings.viewerUrl || DEFAULT_VIEWER_URL;
    const url = `views://main/index.html?viewerUrl=${encodeURIComponent(viewerUrl)}`;

    console.log("Creating main window with URL:", url);

    mainWindow = new BrowserWindow({
      title: "Jutukuva Viewer",
      url,
      frame: {
        width: 1200,
        height: 800,
        x: 120,
        y: 120,
      },
      titleBarStyle: "default",
      rpc,
    });

    console.log("Main window created, ID:", mainWindow.id);

    // Ensure window is visible and focused
    setTimeout(() => {
      try {
        mainWindow?.focus();
        console.log("Main window focused");
      } catch (error) {
        console.error("Failed to focus main window:", error);
      }
    }, 100);

    mainWindow.on("close", () => {
      console.log("Main window closed");
      mainWindow = null;
    });

    mainWindow.webview.on("dom-ready", () => {
      console.log("Main window DOM ready");
      // Wait a bit for RPC to be fully initialized
      setTimeout(() => {
        broadcastSettings();
      }, 100);
    });

    mainWindow.webview.on("did-navigate", (event: any) => {
      console.log("Main window navigated to:", event.url);
    });

    mainWindow.webview.on("will-navigate", (event: any) => {
      console.log("Main window will navigate to:", event.url);
    });

    mainWindow.webview.on("did-commit-navigation", (event: any) => {
      console.log("Main window committed navigation to:", event.url);
    });

    console.log("Main window setup complete");
  } catch (error) {
    console.error("Failed to create main window:", error);
    throw error;
  }
}

function createOverlayWindow() {
  const frame = settings.overlayPosition ?? {
    width: 800,
    height: 180,
    x: 200,
    y: 900,
  };

  overlayWindow = new BrowserWindow({
    title: "Subtitles",
    url: "views://overlay/index.html",
    frame,
    renderer: "native",
    styleMask: {
      Borderless: true,
      FullSizeContentView: true,
      NonactivatingPanel: true,
      HUDWindow: true,
    },
    titleBarStyle: "hiddenInset",
    rpc,
  });

  overlayWindow.on("close", () => {
    overlayWindow = null;
    try {
      if (mainWindow?.webview?.rpc) {
        mainWindow.webview.rpc.send.overlayVisibility?.({ visible: false });
      }
    } catch (error) {
      console.warn("Failed to send overlay closed visibility:", error);
    }
  });

  overlayWindow.on("move", ({ x, y }: { x: number; y: number }) => {
    persistOverlayPosition({ x, y });
  });

  overlayWindow.on(
    "resize",
    ({
      x,
      y,
      width,
      height,
    }: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      persistOverlayPosition({ x, y, width, height });
    }
  );

  overlayWindow.webview.on("dom-ready", () => {
    console.log("Overlay window DOM ready");
    // Wait a bit for RPC to be fully initialized
    setTimeout(() => {
      broadcastSettings();
    }, 100);
  });
}

function toggleOverlayWindow(forceVisible?: boolean): boolean {
  const currentlyVisible = Boolean(overlayWindow);
  const shouldShow = forceVisible ?? !currentlyVisible;

  if (shouldShow && !overlayWindow) {
    createOverlayWindow();
  } else if (!shouldShow && overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }

  try {
    if (mainWindow?.webview?.rpc) {
      mainWindow.webview.rpc.send.overlayVisibility?.({
        visible: Boolean(overlayWindow),
      });
    }
  } catch (error) {
    console.warn("Failed to send overlay visibility:", error);
  }
  return Boolean(overlayWindow);
}

function persistOverlayPosition(partial: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const current = settings.overlayPosition ?? {
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 800,
    height: partial.height ?? 180,
  };

  settings = {
    ...settings,
    overlayPosition: {
      ...current,
      ...partial,
    },
  };
  saveSettings(settings);
}

function broadcastSettings() {
  try {
    if (overlayWindow?.webview?.rpc) {
      overlayWindow.webview.rpc.send.settingsUpdated?.(settings);
    }
  } catch (error) {
    console.warn("Failed to broadcast settings to overlay:", error);
  }

  try {
    if (mainWindow?.webview?.rpc) {
      mainWindow.webview.rpc.send.settingsUpdated?.(settings);
    }
  } catch (error) {
    console.warn("Failed to broadcast settings to main window:", error);
  }
}

function sendSubtitles(lines: string[]) {
  if (!overlayWindow?.webview?.rpc) return;
  try {
    const trimmed = lines.slice(-3);
    overlayWindow.webview.rpc.send.subtitles?.({ lines: trimmed });
  } catch (error) {
    console.warn("Failed to send subtitles:", error);
  }
}

function forwardJoinSession(code: string) {
  ensureMainWindow();
  try {
    if (mainWindow?.webview?.rpc) {
      mainWindow.webview.rpc.send.joinSession?.({ code });
    }
  } catch (error) {
    console.warn("Failed to forward join session:", error);
  }
}

function createTray() {
  tray = new Tray({
    image: "views://icons/tray-icon.png",
    width: 16,
    height: 16,
    template: true,
  });

  tray.setMenu([
    { type: "normal", label: "Show Viewer", action: "show-main" },
    { type: "normal", label: "Toggle Overlay", action: "toggle-overlay" },
    { type: "divider" },
    { type: "normal", label: "Join Session…", action: "join-session" },
    { type: "divider" },
    { type: "normal", label: "Quit", action: "quit" },
  ]);

  Electrobun.events.on("tray-clicked", (event) => {
    handleTrayAction(event.data.action);
  });
}

function handleTrayAction(action: string) {
  switch (action) {
    case "show-main":
      ensureMainWindow();
      mainWindow?.focus();
      break;
    case "toggle-overlay":
      toggleOverlayWindow();
      break;
    case "join-session":
      ensureMainWindow();
      mainWindow?.focus();
      // Signal UI to focus join input
      try {
        if (mainWindow?.webview?.rpc) {
          mainWindow.webview.rpc.send.joinSession?.({ code: "" });
        }
      } catch (error) {
        console.warn("Failed to send join session signal:", error);
      }
      break;
    case "quit":
      process.exit(0);
      break;
    default:
      console.warn("Unhandled tray action", action);
  }
}

// Boot the app
console.log("Starting Electrobun viewer...");
console.log("Settings loaded:", JSON.stringify(settings, null, 2));

try {
  ensureMainWindow();
  console.log("Main window ensured");
} catch (error) {
  console.error("Failed to create main window during boot:", error);
}

try {
  createTray();
  console.log("Tray created");
} catch (error) {
  console.error("Failed to create tray:", error);
}

console.log("Electrobun viewer started with overlay support.");
