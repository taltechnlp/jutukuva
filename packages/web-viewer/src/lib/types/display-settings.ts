export type ViewMode = "text" | "captions";
export type HorizontalAlignment = "full" | "left" | "middle" | "right";

export interface DisplaySettings {
  fontSize: number;
  fontWeight: 400 | 600;
  textColor: string;
  backgroundColor: string;
  horizontalAlignment: HorizontalAlignment;
  viewMode: ViewMode;
  letterSpacing: number;
}

export const defaultSettings: DisplaySettings = {
  fontSize: 72,
  fontWeight: 600,
  textColor: "#000000",
  backgroundColor: "#FFFFFF",
  horizontalAlignment: "middle",
  viewMode: "text",
  letterSpacing: 0.02,
};
