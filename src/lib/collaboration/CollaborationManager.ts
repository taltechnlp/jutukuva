/**
 * CollaborationManager - Manages Yjs collaborative editing
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { EditorView } from 'prosemirror-view';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from 'y-prosemirror';
import type { SessionInfo, SessionRole, Participant, WordApprovalData, SessionMetadata } from './types';

const YJS_SERVER_URL = import.meta.env.VITE_YJS_SERVER_URL || 'wss://tekstiks.ee/kk';

export class CollaborationManager {
	public ydoc: Y.Doc;
	public provider: WebsocketProvider | null = null;
	public sessionInfo: SessionInfo | null = null;

	// Shared Yjs types
	public wordApprovalsMap: Y.Map<WordApprovalData> | null = null;
	public sessionMetadataMap: Y.Map<any> | null = null;

	// Callbacks
	private onParticipantsChange?: (participants: Participant[]) => void;
	private onConnectionStatusChange?: (connected: boolean) => void;

	constructor() {
		this.ydoc = new Y.Doc();
	}

	/**
	 * Initialize the WebSocket provider (can be called before editor is ready)
	 * @param sessionInfo - Session information (code, role, room name)
	 * @param callbacks - Event callbacks
	 */
	initializeProvider(
		sessionInfo: SessionInfo,
		callbacks?: {
			onParticipantsChange?: (participants: Participant[]) => void;
			onConnectionStatusChange?: (connected: boolean) => void;
		}
	): void {
		this.sessionInfo = sessionInfo;
		this.onParticipantsChange = callbacks?.onParticipantsChange;
		this.onConnectionStatusChange = callbacks?.onConnectionStatusChange;

		// Connect to WebSocket provider
		this.provider = new WebsocketProvider(
			sessionInfo.serverUrl,
			sessionInfo.roomName,
			this.ydoc,
			{
				connect: true
			}
		);

		// Initialize shared types
		this.wordApprovalsMap = this.ydoc.getMap('wordApprovals');
		this.sessionMetadataMap = this.ydoc.getMap('sessionMetadata');

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
			this.onConnectionStatusChange?.(connected);
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

		const plugins = [
			ySyncPlugin(type),
			...(includeCursor ? [yCursorPlugin(this.provider.awareness)] : []),
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
