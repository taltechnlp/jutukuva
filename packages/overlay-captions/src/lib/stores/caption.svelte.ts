import { invoke } from '@tauri-apps/api/core';
import { yjsStore } from './yjs.svelte';

const MAX_CHARS_LAST_ONLY = 320;
const MAX_CHARS_MULTI_LINE = 900;
const TRIM_PREFIX = '...';

const trimToMaxChars = (text: string, maxChars: number): string => {
	const trimmed = text.trim();
	if (!trimmed || trimmed.length <= maxChars) {
		return trimmed;
	}

	const slice = trimmed.slice(-maxChars);
	const firstWhitespaceIndex = slice.search(/\s/);
	const safeSlice = firstWhitespaceIndex > 0 ? slice.slice(firstWhitespaceIndex) : slice;
	return `${TRIM_PREFIX}${safeSlice.trimStart()}`;
};

class CaptionStore {
	text = $state('');
	lastParagraphs = $state<string[]>([]);
	lastUpdated = $state<number | null>(null);
	displayMode = $state<'lastOnly' | 'multiLine'>('lastOnly');
	displayText = $state('');

	private observer: (() => void) | null = null;
	private updateHandler: ((update: Uint8Array) => void) | null = null;

	private emitToOverlay(text: string) {
		// Broadcast through Rust backend to all windows
		console.log('[Caption] Calling broadcast_caption with text:', text.substring(0, 50));
		invoke('broadcast_caption', { text })
			.then(() => {
				console.log('[Caption] broadcast_caption succeeded');
			})
			.catch((e) => {
				console.error('[Caption] Failed to broadcast:', e);
			});
	}

	private buildDisplayText(mode: 'lastOnly' | 'multiLine', text: string, paragraphs: string[]): string {
		if (!text) return '';

		if (mode === 'lastOnly') {
			const lastPara = paragraphs.slice(-1).join('\n');
			const fallbackLines = text.split('\n').filter((line) => line.trim());
			const baseText = lastPara || fallbackLines.slice(-1).join('\n') || text;
			return trimToMaxChars(baseText, MAX_CHARS_LAST_ONLY);
		}

		const baseText = paragraphs.length > 0 ? paragraphs.join('\n') : text;
		return trimToMaxChars(baseText, MAX_CHARS_MULTI_LINE);
	}

	startObserving() {
		if (!yjsStore.ydoc) return;

		const xmlFrag = yjsStore.ydoc.getXmlFragment('prosemirror');

		const update = () => {
			const newText = yjsStore.extractText();
			const newParagraphs = yjsStore.getLastParagraphs(3);

			if (newText !== this.text) {
				this.text = newText;
				this.lastParagraphs = newParagraphs;
				this.lastUpdated = Date.now();

				// Determine what text to show
				const captionText = this.buildDisplayText(this.displayMode, newText, newParagraphs);
				this.displayText = captionText;

				console.log('[Caption] Emitting to overlay:', captionText.substring(0, 50));
				this.emitToOverlay(captionText);
			}
		};

		xmlFrag.observe(update);
		this.observer = () => xmlFrag.unobserve(update);

		this.updateHandler = () => setTimeout(update, 10);
		yjsStore.ydoc.on('update', this.updateHandler);

		// Initial extraction
		update();
	}

	stopObserving() {
		this.observer?.();
		this.observer = null;
		if (yjsStore.ydoc && this.updateHandler) {
			yjsStore.ydoc.off('update', this.updateHandler);
		}
		this.updateHandler = null;
	}

	setDisplayMode(mode: 'lastOnly' | 'multiLine') {
		this.displayMode = mode;
		// Re-emit current caption with new mode
		const captionText = this.buildDisplayText(mode, this.text, this.lastParagraphs);
		this.displayText = captionText;
		this.emitToOverlay(captionText);
	}

	clear() {
		this.text = '';
		this.lastParagraphs = [];
		this.lastUpdated = null;
		this.displayText = '';
	}
}

export const captionStore = new CaptionStore();
