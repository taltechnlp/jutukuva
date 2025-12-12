import { type RPCSchema } from "electrobun";

export type OverlaySettings = {
  fontSize: number;
  textColor: string;
  background: string;
  alignment: "left" | "center" | "right";
  maxLines: number;
  viewerUrl: string;
  overlayPosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type AppRPCSchema = {
  bun: RPCSchema<{
    requests: {
      toggleOverlay: {
        params: { visible?: boolean };
        response: { visible: boolean };
      };
      updateSettings: {
        params: Partial<OverlaySettings>;
        response: OverlaySettings;
      };
      joinSession: {
        params: { code: string };
        response: { code: string };
      };
      showMain: {
        params: void;
        response: boolean;
      };
      pushSubtitles: {
        params: { lines: string[] };
        response: boolean;
      };
    };
    messages: {
      overlayReady: undefined;
      requestSettings: undefined;
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      overlayVisibility: { visible: boolean };
      settingsUpdated: OverlaySettings;
      subtitles: { lines: string[] };
      joinSession: { code: string };
    };
  }>;
};
