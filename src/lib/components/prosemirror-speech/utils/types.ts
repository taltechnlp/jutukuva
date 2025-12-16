/**
 * Types for ProseMirror Speech Editor
 */

export type StreamingTextEvent = {
	text: string;
	isFinal: boolean;
	start?: number;
	end?: number;
};

export type EditorConfig = {
	fontSize?: number;
	theme?: 'light' | 'dark';
};
