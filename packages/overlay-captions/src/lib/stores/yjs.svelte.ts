import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface Speaker {
	name: string;
	color?: string;
}

class YjsStore {
	ydoc = $state<Y.Doc | null>(null);
	provider = $state<WebsocketProvider | null>(null);
	connected = $state(false);
	connecting = $state(false);
	sessionCode = $state<string | null>(null);
	speakers = $state<Map<string, Speaker>>(new Map());
	error = $state<string | null>(null);

	connect(sessionCode: string, serverUrl: string, password?: string) {
		this.disconnect();
		this.connecting = true;
		this.error = null;

		try {
			this.ydoc = new Y.Doc();

			// Build room URL with password parameter if provided
			const params = new URLSearchParams();
			if (password) {
				params.set('password', password);
			}
			params.set('role', 'guest');
			const queryString = params.toString();
			const roomWithParams = queryString ? `${sessionCode}?${queryString}` : sessionCode;

			this.provider = new WebsocketProvider(serverUrl, roomWithParams, this.ydoc, {
				connect: true,
				maxBackoffTime: 5000,
				disableBc: true
			});

			this.sessionCode = sessionCode;

			this.provider.on('status', ({ status }: { status: string }) => {
				this.connected = status === 'connected';
				this.connecting = status === 'connecting';
				if (status === 'connected') {
					this.error = null;
				}
			});

			this.provider.on('connection-error', (event: Event) => {
				console.error('[YJS] Connection error:', event);
				this.error = 'Connection failed';
				this.connected = false;
				this.connecting = false;
			});

			// Listen for connection close (for password-protected sessions)
			this.provider.on('connection-close', (event: any) => {
				console.log('[YJS] Connection closed:', event?.code, event?.reason);
				// Check if it's a password error (code 4001 from our server)
				if (event?.code === 4001 || event?.reason?.includes('password') || event?.reason?.includes('Invalid')) {
					// Stop auto-reconnect by disconnecting the provider
					this.provider?.disconnect();
					this.error = 'password_required';
					this.connected = false;
					this.connecting = false;
				}
			});

			// Observe speakers map
			const speakersMap = this.ydoc.getMap<Speaker>('speakers');
			speakersMap.observe(() => {
				this.speakers = new Map(speakersMap.entries());
			});

			// Load initial speakers
			this.speakers = new Map(speakersMap.entries());

			// Set user info
			this.provider.awareness.setLocalStateField('user', {
				name: 'Viewer',
				color: '#' + Math.floor(Math.random() * 16777215).toString(16),
				role: 'guest'
			});
		} catch (e) {
			console.error('[YJS] Failed to connect:', e);
			this.error = String(e);
			this.connecting = false;
		}
	}

	disconnect() {
		if (this.provider) {
			this.provider.disconnect();
			this.provider.destroy();
			this.provider = null;
		}
		if (this.ydoc) {
			this.ydoc.destroy();
			this.ydoc = null;
		}
		this.connected = false;
		this.connecting = false;
		this.sessionCode = null;
		this.speakers = new Map();
	}

	getSpeakerName(speakerId: string | null): string | null {
		if (!speakerId) return null;
		const speaker = this.speakers.get(speakerId);
		return speaker?.name || null;
	}

	extractText(): string {
		if (!this.ydoc) return '';

		try {
			const xmlFrag = this.ydoc.getXmlFragment('prosemirror');
			const rawText = xmlFrag.toString();

			// Parse paragraphs with speaker prefixes
			const paragraphs: string[] = [];
			const paragraphRegex = /<paragraph([^>]*)>([\s\S]*?)<\/paragraph>/g;
			let match;

			while ((match = paragraphRegex.exec(rawText)) !== null) {
				const attrs = match[1];
				const content = match[2];

				const speakerIdMatch = attrs.match(/speakerId="([^"]*)"/);
				const speakerId = speakerIdMatch ? speakerIdMatch[1] : null;
				const speakerName = this.getSpeakerName(speakerId);

				const plainText = content
					.replace(/<[^>]*>/g, '')
					.replace(/ +/g, ' ')
					.trim();

				if (plainText) {
					paragraphs.push(speakerName ? `${speakerName}: ${plainText}` : plainText);
				}
			}

			// Fallback if regex didn't match
			if (paragraphs.length === 0) {
				return rawText
					.replace(/<\/paragraph>/g, '\n')
					.replace(/<[^>]*>/g, '')
					.replace(/ +/g, ' ')
					.replace(/\n /g, '\n')
					.replace(/ \n/g, '\n')
					.trim();
			}

			return paragraphs.join('\n');
		} catch (err) {
			console.error('[YJS] Error extracting text:', err);
			return '';
		}
	}

	getLastParagraphs(count: number = 1): string[] {
		if (!this.ydoc) return [];

		try {
			const xmlFrag = this.ydoc.getXmlFragment('prosemirror');
			const rawText = xmlFrag.toString();

			const paragraphs: string[] = [];
			const paragraphRegex = /<paragraph([^>]*)>([\s\S]*?)<\/paragraph>/g;
			let match;

			while ((match = paragraphRegex.exec(rawText)) !== null) {
				const attrs = match[1];
				const content = match[2];

				const speakerIdMatch = attrs.match(/speakerId="([^"]*)"/);
				const speakerId = speakerIdMatch ? speakerIdMatch[1] : null;
				const speakerName = this.getSpeakerName(speakerId);

				const plainText = content
					.replace(/<[^>]*>/g, '')
					.replace(/ +/g, ' ')
					.trim();

				if (plainText) {
					paragraphs.push(speakerName ? `${speakerName}: ${plainText}` : plainText);
				}
			}

			return paragraphs.slice(-count);
		} catch (err) {
			console.error('[YJS] Error extracting paragraphs:', err);
			return [];
		}
	}
}

export const yjsStore = new YjsStore();
