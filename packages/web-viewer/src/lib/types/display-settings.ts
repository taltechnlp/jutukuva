export type DisplayMode = 'fullscreen' | 'overlay';

export interface DisplaySettings {
	fontSize: number;
	fontWeight: 400 | 600;
	textColor: string;
	backgroundColor: string;
	verticalPosition: number;
	mode: DisplayMode;
	overlayOpacity: number;
	letterSpacing: number;
}

export const defaultSettings: DisplaySettings = {
	fontSize: 72,
	fontWeight: 600,
	textColor: '#FFFFFF',
	backgroundColor: '#000000',
	verticalPosition: 30,
	mode: 'fullscreen',
	overlayOpacity: 0.9,
	letterSpacing: 0.02
};
