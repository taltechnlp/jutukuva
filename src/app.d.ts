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
			createSession: (id: string, name: string, scheduledDate?: string | null, description?: string | null) => Promise<string>;
			updateSession: (
				id: string,
				data: {
					name?: string;
					duration_seconds?: number;
					word_count?: number;
					subtitle_count?: number;
					status?: 'planned' | 'active' | 'completed' | 'cancelled';
					scheduled_date?: string | null;
					completed_at?: string | null;
					cancelled_at?: string | null;
					session_code?: string;
					collaboration_role?: string;
					participants?: string;
					session_password?: string | null;
				}
			) => Promise<boolean>;
			getSession: (id: string) => Promise<TranscriptionSession | null>;
			getAllSessions: () => Promise<Array<TranscriptionSession>>;
			deleteSession: (id: string) => Promise<boolean>;

			// Session lifecycle
			getSessionsByStatus: (status: 'planned' | 'active' | 'completed' | 'cancelled') => Promise<Array<TranscriptionSession>>;
			getUpcomingSessions: () => Promise<Array<TranscriptionSession>>;
			getPastSessions: () => Promise<Array<TranscriptionSession>>;
			activateSession: (id: string) => Promise<TranscriptionSession>;
			completeSession: (id: string) => Promise<TranscriptionSession>;
			cancelSession: (id: string) => Promise<TranscriptionSession>;
			updateSessionStatus: (id: string, status: 'planned' | 'active' | 'completed' | 'cancelled') => Promise<TranscriptionSession>;

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

			// Autocomplete dictionaries
			createDictionary: (id: string, name: string, isActive?: number) => Promise<AutocompleteDictionary>;
			getDictionary: (id: string) => Promise<AutocompleteDictionary | null>;
			getAllDictionaries: () => Promise<Array<AutocompleteDictionary>>;
			updateDictionary: (id: string, data: { name?: string; is_active?: number }) => Promise<AutocompleteDictionary>;
			deleteDictionary: (id: string) => Promise<boolean>;

			// Autocomplete entries
			createEntry: (id: string, dictionaryId: string, trigger: string, replacement: string) => Promise<AutocompleteEntry>;
			getEntry: (id: string) => Promise<AutocompleteEntry | null>;
			getDictionaryEntries: (dictionaryId: string) => Promise<Array<AutocompleteEntry>>;
			updateEntry: (id: string, data: { trigger?: string; replacement?: string }) => Promise<AutocompleteEntry>;
			deleteEntry: (id: string) => Promise<boolean>;
			getActiveEntries: () => Promise<Array<AutocompleteEntry & { dictionary_name: string }>>;

			// Dictionary import/export
			exportDictionary: (id: string) => Promise<{ name: string; entries: Record<string, string> }>;
			importDictionary: (name: string, entries: Record<string, string>) => Promise<AutocompleteDictionary>;

			// Speakers
			getSessionSpeakers: (sessionId: string) => Promise<Array<SessionSpeaker>>;
			setSessionSpeakers: (sessionId: string, speakers: Array<SessionSpeaker>) => Promise<boolean>;

			// Editor state persistence
			saveEditorState: (sessionId: string, editorState: string) => Promise<boolean>;
			getEditorState: (sessionId: string) => Promise<string | null>;
			clearEditorState: (sessionId: string) => Promise<boolean>;

			// End session
			endSession: (id: string, deleteContent: boolean) => Promise<TranscriptionSession>;
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
			onDeepLinkJoin: (callback: (data: { code: string; password: string | null }) => void) => void;
			downloadBlackHole: () => Promise<{ success: boolean; error?: string; path?: string }>;
			onDownloadProgress: (callback: (progress: number) => void) => void;
			openAudioMIDISetup: () => Promise<void>;
			resetPermissionCheck: () => Promise<void>;
		};
		asr: {
			initialize: () => Promise<ASRInitResult>;
			start: () => Promise<ASRStartResult>;
			sendAudio: (audioData: Float32Array) => Promise<ASRTranscriptResult>;
			stop: () => Promise<ASRTranscriptResult>;
			status: () => Promise<ASRStatus>;
			onDownloadProgress: (callback: (progress: ASRDownloadProgress) => void) => void;
			removeDownloadProgressListener: () => void;
		};
	}

	interface ASRInitResult {
		success: boolean;
		error?: string;
		alreadyInitialized?: boolean;
	}

	interface ASRStartResult {
		success: boolean;
		sessionId?: string;
		error?: string;
	}

	interface ASRTranscriptResult {
		text: string;
		isFinal: boolean;
		error?: string;
	}

	interface ASRStatus {
		isInitialized: boolean;
		hasActiveSession: boolean;
		sessionId?: string | null;
		modelPath?: string | null;
		error?: string;
	}

	interface ASRDownloadProgress {
		overallProgress: number;
		currentFile: string;
		fileProgress: number;
		completedFiles: number;
		totalFiles: number;
	}

	interface TranscriptionSession {
		id: string;
		name: string;
		created_at: string;
		updated_at: string;
		duration_seconds: number;
		word_count: number;
		subtitle_count: number;
		status: 'planned' | 'active' | 'completed' | 'cancelled';
		is_collaborative: number;
		session_code: string | null;
		collaboration_role: string | null;
		participants: string | null;
		scheduled_date: string | null;
		completed_at: string | null;
		cancelled_at: string | null;
		speakers: string | null;
		editor_state: string | null;
		session_password: string | null;
	}

	interface AutocompleteDictionary {
		id: string;
		name: string;
		is_active: number;
		is_builtin: number;
		created_at: string;
		updated_at: string;
	}

	interface AutocompleteEntry {
		id: string;
		dictionary_id: string;
		trigger: string;
		replacement: string;
		created_at: string;
	}

	interface SessionSpeaker {
		id: string;
		name: string;
		color?: string;
		createdBy?: number;
		createdAt?: number;
	}
}

export {};
