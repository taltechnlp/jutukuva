/**
 * Types for ProseMirror Speech Editor
 */

export type Word = {
	id: string;
	text: string;
	start: number; // timestamp in seconds
	end: number; // timestamp in seconds
};

export type SubtitleSegment = {
	index: number;
	words: Word[];
	startTime: number;
	endTime: number;
	text: string;
	srt: string; // formatted SRT block
};

export type StreamingTextEvent = {
	text: string;
	isFinal: boolean;
	start?: number;
	end?: number;
};

export type EditorConfig = {
	fontSize?: number;
	theme?: 'light' | 'dark';
	onSubtitleEmit?: (srt: string, segment: SubtitleSegment) => void;
};
