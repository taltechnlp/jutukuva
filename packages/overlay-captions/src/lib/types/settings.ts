export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface OverlaySettings {
  enabled: boolean;
  position: Position;
  size: Size;
  positionPreset: string;
  opacity: number;
  clickThrough: boolean;
  alwaysOnTop: boolean;
  displayMode: "lastOnly" | "multiLine";
  backgroundColor: string;
}

export interface FontSettings {
  family: string;
  size: number;
  weight: number;
  color: string;
  align: "left" | "center" | "right" | "justify";
}

export interface ConnectionSettings {
  yjsServerUrl: string;
  autoConnect: boolean;
}

export interface AppSettings {
  overlay: OverlaySettings;
  font: FontSettings;
  connection: ConnectionSettings;
  lastSessionCode: string | null;
  theme: string;
}

export const defaultSettings: AppSettings = {
  overlay: {
    enabled: false,
    position: { x: 100, y: 100 },
    size: { width: 300, height: 160 },
    positionPreset: "bottom",
    opacity: 0.95,
    clickThrough: false,
    alwaysOnTop: true,
    displayMode: "lastOnly",
    backgroundColor: "#000000",
  },
  font: {
    family: "Inter, system-ui, sans-serif",
    size: 32,
    weight: 500,
    color: "#ffffff",
    align: "justify",
  },
  connection: {
    yjsServerUrl: "wss://tekstiks.ee/kk",
    autoConnect: true,
  },
  lastSessionCode: null,
  theme: "system",
};
