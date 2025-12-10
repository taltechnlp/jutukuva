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
		size: { width: 800, height: 160 },
		positionPreset: 'bottom',
		opacity: 0.95,
		clickThrough: false,
		alwaysOnTop: true
	},
	font: {
		family: 'Inter, system-ui, sans-serif',
		size: 32,
		weight: 500,
		color: '#ffffff',
		backgroundColor: '#1a1a1a',
		backgroundOpacity: 0.85
	},
	connection: {
		yjsServerUrl: 'wss://tekstiks.ee/kk',
		autoConnect: true
	},
	lastSessionCode: null,
	theme: 'system'
};
