/**
 * CollaborationManager - Manages Yjs collaborative editing
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { EditorView } from 'prosemirror-view';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
import { speechSchema } from '../components/prosemirror-speech/schema';
import type { SessionInfo, SessionRole, Participant, WordApprovalData, SessionMetadata, Speaker } from './types';
import { v4 as uuidv4 } from 'uuid';

const YJS_SERVER_URL = import.meta.env.VITE_YJS_SERVER_URL || 'wss://tekstiks.ee/kk';

export class CollaborationManager {
	public ydoc: Y.Doc;
	public provider: WebsocketProvider | null = null;
	public sessionInfo: SessionInfo | null = null;

	// Shared Yjs types
	public wordApprovalsMap: Y.Map<WordApprovalData> | null = null;
	public sessionMetadataMap: Y.Map<any> | null = null;
	public speakersMap: Y.Map<Speaker> | null = null;

	// Callbacks
	private onParticipantsChange?: (participants: Participant[]) => void;
	private onConnectionStatusChange?: (connected: boolean) => void;
	private onSpeakersChange?: (speakers: Speaker[]) => void;
	private onPasswordRequired?: () => void;

	constructor() {
		this.ydoc = new Y.Doc();
	}

	/**
	 * Initialize the WebSocket provider (can be called before editor is ready)
	 * @param sessionInfo - Session information (code, role, room name)
	 * @param callbacks - Event callbacks
	 * @param options - Additional options
	 * @param options.initialContent - Initial ProseMirror document JSON to populate Yjs with (for preserving existing editor content)
	 */
	initializeProvider(
		sessionInfo: SessionInfo,
		callbacks?: {
			onParticipantsChange?: (participants: Participant[]) => void;
			onConnectionStatusChange?: (connected: boolean) => void;
			onSpeakersChange?: (speakers: Speaker[]) => void;
			onPasswordRequired?: () => void;
		},
		options?: {
			initialContent?: object;
		}
	): void {
		this.sessionInfo = sessionInfo;
		this.onParticipantsChange = callbacks?.onParticipantsChange;
		this.onConnectionStatusChange = callbacks?.onConnectionStatusChange;
		this.onSpeakersChange = callbacks?.onSpeakersChange;
		this.onPasswordRequired = callbacks?.onPasswordRequired;

		// If initial content is provided, populate the Yjs XmlFragment BEFORE connecting
		// This ensures existing editor content is preserved when starting a session
		console.log('[CollaborationManager] options?.initialContent:', options?.initialContent);
		console.log('[CollaborationManager] sessionInfo.role:', sessionInfo.role);
		if (options?.initialContent && sessionInfo.role === 'host') {
			const xmlFragment = this.ydoc.getXmlFragment('prosemirror');
			console.log('[CollaborationManager] xmlFragment.length before:', xmlFragment.length);
			// Only populate if the fragment is empty (new session)
			if (xmlFragment.length === 0) {
				console.log('[CollaborationManager] Populating Yjs with initial content');
				prosemirrorJSONToYXmlFragment(speechSchema, options.initialContent, xmlFragment);
				console.log('[CollaborationManager] xmlFragment.length after:', xmlFragment.length);
			}
		}

		// Build room URL with password and role parameters
		const params = new URLSearchParams();
		if (sessionInfo.password) {
			params.set('password', sessionInfo.password);
		}
		params.set('role', sessionInfo.role);
		const queryString = params.toString();
		const roomWithParams = queryString ? `${sessionInfo.roomName}?${queryString}` : sessionInfo.roomName;

		// Connect to WebSocket provider
		console.log('[CollaborationManager] Connecting to:', sessionInfo.serverUrl, 'room:', roomWithParams);
		this.provider = new WebsocketProvider(
			sessionInfo.serverUrl,
			roomWithParams,
			this.ydoc,
			{
				connect: true,
				// Add reconnection parameters
				maxBackoffTime: 5000,
				// Disable BC channel for Electron compatibility
				disableBc: true
			}
		);

		// Initialize shared types
		this.wordApprovalsMap = this.ydoc.getMap('wordApprovals');
		this.sessionMetadataMap = this.ydoc.getMap('sessionMetadata');
		this.speakersMap = this.ydoc.getMap('speakers');

		// Observe speaker changes
		this.speakersMap.observe(() => {
			this.onSpeakersChange?.(this.getSpeakers());
		});

		// Set session metadata if host
		if (sessionInfo.role === 'host') {
			this.sessionMetadataMap.set('hostClientId', this.provider.awareness.clientID);
		}

		// Listen to awareness changes (participants joining/leaving)
		this.provider.awareness.on('change', () => {
			this.handleAwarenessChange();
		});

		// Listen to connection status
		this.provider.on('status', ({ status }: { status: string }) => {
			const connected = status === 'connected';
			console.log('[CollaborationManager] Connection status:', status);
			this.onConnectionStatusChange?.(connected);
		});

		// Listen for connection errors
		this.provider.on('connection-error', (event: Event) => {
			console.error('[CollaborationManager] Connection error:', event);
		});

		// Listen for connection close (to detect password-required errors)
		this.provider.on('connection-close', (event: CloseEvent | null) => {
			console.log('[CollaborationManager] Connection closed:', event?.code, event?.reason);
			// Code 4001 means password required/invalid
			if (event?.code === 4001 || event?.reason?.toLowerCase().includes('password')) {
				console.log('[CollaborationManager] Password required for session');
				// Disconnect to prevent auto-reconnect
				this.disconnect();
				this.onPasswordRequired?.();
			}
		});

		// Set user info in awareness
		this.provider.awareness.setLocalStateField('user', {
			name: sessionInfo.role === 'host' ? 'Host' : 'Guest',
			color: this.getRandomColor(),
			role: sessionInfo.role
		});

		console.log('[CollaborationManager] Provider initialized for session:', sessionInfo.code);
	}

	/**
	 * Start a collaborative session (legacy method - calls initializeProvider)
	 * @param sessionInfo - Session information (code, role, room name)
	 * @param editorView - ProseMirror editor view (not used anymore, kept for compatibility)
	 * @param callbacks - Event callbacks
	 */
	connect(
		sessionInfo: SessionInfo,
		editorView: EditorView,
		callbacks?: {
			onParticipantsChange?: (participants: Participant[]) => void;
			onConnectionStatusChange?: (connected: boolean) => void;
		}
	): void {
		// If provider not initialized, initialize it
		if (!this.provider) {
			this.initializeProvider(sessionInfo, callbacks);
		}
		console.log('[CollaborationManager] Connected to session:', sessionInfo.code);
	}

	/**
	 * Disconnect from collaborative session
	 */
	disconnect(): void {
		if (this.provider) {
			this.provider.disconnect();
			this.provider.destroy();
			this.provider = null;
		}
		this.sessionInfo = null;
		console.log('[CollaborationManager] Disconnected from session');
	}

	/**
	 * Get ProseMirror plugins for Yjs integration
	 * @param options - Configuration options
	 * @param options.includeCursor - Whether to include cursor tracking plugin (default: true)
	 */
	getProseMirrorPlugins(options?: { includeCursor?: boolean }) {
		if (!this.provider) {
			throw new Error('Provider not initialized. Call connect() first.');
		}

		const type = this.ydoc.getXmlFragment('prosemirror');
		const includeCursor = options?.includeCursor ?? true;

		// Custom cursor builder for proper inline cursor display
		const cursorBuilder = (user: { name: string; color: string }) => {
			const cursor = document.createElement('span');
			cursor.classList.add('collaboration-cursor');
			cursor.style.setProperty('--cursor-color', user.color);

			// Cursor caret line
			const caret = document.createElement('span');
			caret.classList.add('collaboration-cursor-caret');
			cursor.appendChild(caret);

			// User name label
			const label = document.createElement('span');
			label.classList.add('collaboration-cursor-label');
			label.textContent = user.name;
			cursor.appendChild(label);

			return cursor;
		};

		const plugins = [
			ySyncPlugin(type),
			...(includeCursor ? [yCursorPlugin(this.provider.awareness, { cursorBuilder })] : []),
			yUndoPlugin()
		];

		return plugins;
	}

	/**
	 * Approve a word (sync via Yjs)
	 * @param wordId - Word UUID
	 * @returns true if approval succeeded (first to approve wins)
	 */
	approveWord(wordId: string): boolean {
		if (!this.wordApprovalsMap || !this.provider) {
			return false;
		}

		// Check if already approved
		const existing = this.wordApprovalsMap.get(wordId);
		if (existing?.approved) {
			console.log('[CollaborationManager] Word already approved by', existing.approvedBy);
			return false;
		}

		// Approve it (first to write wins due to Yjs CRDT)
		this.wordApprovalsMap.set(wordId, {
			approved: true,
			approvedBy: String(this.provider.awareness.clientID),
			timestamp: Date.now()
		});

		return true;
	}

	/**
	 * Check if a word is approved
	 */
	isWordApproved(wordId: string): boolean {
		return this.wordApprovalsMap?.get(wordId)?.approved ?? false;
	}

	/**
	 * Get current participants
	 */
	getParticipants(): Participant[] {
		if (!this.provider) {
			return [];
		}

		const participants: Participant[] = [];
		this.provider.awareness.getStates().forEach((state, clientId) => {
			if (state.user) {
				participants.push({
					clientId,
					name: state.user.name,
					color: state.user.color,
					role: state.user.role
				});
			}
		});

		return participants;
	}

	/**
	 * Check if current user is host
	 */
	isHost(): boolean {
		return this.sessionInfo?.role === 'host';
	}

	/**
	 * Get session metadata
	 */
	getSessionMetadata(): SessionMetadata | null {
		if (!this.sessionMetadataMap) {
			return null;
		}

		return {
			hostClientId: this.sessionMetadataMap.get('hostClientId') ?? 0
		};
	}

	/**
	 * Add a new speaker to the session (returns existing speaker if name already exists)
	 */
	addSpeaker(name: string): Speaker {
		const trimmedName = name.trim();
		const existingSpeakers = this.getSpeakers();
		const existing = existingSpeakers.find(
			(s) => s.name.toLowerCase() === trimmedName.toLowerCase()
		);
		if (existing) {
			return existing;
		}

		const speaker: Speaker = {
			id: uuidv4(),
			name: trimmedName,
			color: this.getRandomColor(),
			createdBy: this.provider?.awareness.clientID,
			createdAt: Date.now()
		};

		this.speakersMap?.set(speaker.id, speaker);
		return speaker;
	}

	/**
	 * Update a speaker's properties
	 */
	updateSpeaker(id: string, updates: Partial<Pick<Speaker, 'name' | 'color'>>): void {
		const existing = this.speakersMap?.get(id);
		if (existing) {
			this.speakersMap?.set(id, { ...existing, ...updates });
		}
	}

	/**
	 * Remove a speaker from the session
	 */
	removeSpeaker(id: string): void {
		this.speakersMap?.delete(id);
	}

	/**
	 * Get all speakers in the session
	 */
	getSpeakers(): Speaker[] {
		if (!this.speakersMap) return [];
		return Array.from(this.speakersMap.values());
	}

	/**
	 * Get a speaker by ID
	 */
	getSpeaker(id: string): Speaker | undefined {
		return this.speakersMap?.get(id);
	}

	/**
	 * Handle awareness changes (participants joining/leaving)
	 */
	private handleAwarenessChange(): void {
		const participants = this.getParticipants();
		this.onParticipantsChange?.(participants);
		console.log('[CollaborationManager] Participants:', participants.length);
	}

	/**
	 * Get a random color for cursor/user
	 */
	private getRandomColor(): string {
		const colors = [
			'#FF6B6B', // Red
			'#4ECDC4', // Teal
			'#45B7D1', // Blue
			'#FFA07A', // Salmon
			'#98D8C8', // Mint
			'#F7DC6F', // Yellow
			'#BB8FCE', // Purple
			'#85C1E2'  // Sky blue
		];
		return colors[Math.floor(Math.random() * colors.length)];
	}

	/**
	 * Destroy the collaboration manager
	 */
	destroy(): void {
		this.disconnect();
		this.ydoc.destroy();
	}
}
