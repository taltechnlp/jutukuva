// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		electron: {
			send: (channel: string, data: any) => void;
			receive: (channel: string, func: (...args: any[]) => void) => void;
		};
		db: {
			// Settings
			getSetting: (key: string) => Promise<string | null>;
			setSetting: (key: string, value: string) => Promise<void>;
			getAllSettings: () => Promise<Array<{ key: string; value: string }>>;

			// Transcription sessions
			createSession: (id: string, name: string) => Promise<string>;
			updateSession: (
				id: string,
				data: {
					name?: string;
					duration_seconds?: number;
					word_count?: number;
					subtitle_count?: number;
					status?: string;
				}
			) => Promise<boolean>;
			getSession: (id: string) => Promise<{
				id: string;
				name: string;
				created_at: string;
				updated_at: string;
				duration_seconds: number;
				word_count: number;
				subtitle_count: number;
				status: string;
			} | null>;
			getAllSessions: () => Promise<
				Array<{
					id: string;
					name: string;
					created_at: string;
					updated_at: string;
					duration_seconds: number;
					word_count: number;
					subtitle_count: number;
					status: string;
				}>
			>;
			deleteSession: (id: string) => Promise<boolean>;

			// Transcripts
			addTranscript: (
				sessionId: string,
				segmentIndex: number,
				text: string,
				srtText: string,
				startTime: number,
				endTime: number
			) => Promise<number>;
			getSessionTranscripts: (
				sessionId: string
			) => Promise<
				Array<{
					id: number;
					session_id: string;
					segment_index: number;
					text: string;
					srt_text: string;
					start_time: number;
					end_time: number;
					created_at: string;
				}>
			>;
		};
		broadcast: {
			start: (port: number) => Promise<boolean>;
			stop: () => Promise<boolean>;
			subtitle: (subtitle: any) => Promise<boolean>;
			sessionStart: (sessionInfo: any) => Promise<boolean>;
			sessionEnd: () => Promise<boolean>;
			status: () => Promise<{
				isRunning: boolean;
				port: number;
				clientCount: number;
			}>;
			clientCount: () => Promise<number>;
		};
		electronAPI: {
			getDesktopSources: () => Promise<
				Array<{
					id: string;
					name: string;
					thumbnail: null;
				}>
			>;
			getPlatform: () => Promise<string>;
			setSetting: (key: string, value: string) => Promise<void>;
			getSetting: (key: string) => Promise<string | null>;
		};
	}
}

export {};
