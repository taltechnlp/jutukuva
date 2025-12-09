import { invoke } from '@tauri-apps/api/core';
import { yjsStore } from './yjs.svelte';

class CaptionStore {
	text = $state('');
	lastParagraphs = $state<string[]>([]);
	lastUpdated = $state<number | null>(null);
	displayMode = $state<'lastOnly' | 'multiLine'>('lastOnly');

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
				let captionText: string;
				if (this.displayMode === 'lastOnly') {
					// Show last paragraph, or fall back to last line of full text
					const lastPara = newParagraphs.slice(-1).join('\n');
					if (lastPara) {
						captionText = lastPara;
					} else {
						// Fallback: get last non-empty line from full text
						const lines = newText.split('\n').filter((l) => l.trim());
						captionText = lines.slice(-1).join('\n') || newText;
					}
				} else {
					// Multi-line mode: show last 3 paragraphs or full text
					captionText = newParagraphs.length > 0 ? newParagraphs.join('\n') : newText;
				}

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
		let captionText: string;
		if (mode === 'lastOnly') {
			const lastPara = this.lastParagraphs.slice(-1).join('\n');
			if (lastPara) {
				captionText = lastPara;
			} else {
				const lines = this.text.split('\n').filter((l) => l.trim());
				captionText = lines.slice(-1).join('\n') || this.text;
			}
		} else {
			captionText =
				this.lastParagraphs.length > 0 ? this.lastParagraphs.join('\n') : this.text;
		}

		this.emitToOverlay(captionText);
	}

	clear() {
		this.text = '';
		this.lastParagraphs = [];
		this.lastUpdated = null;
	}
}

export const captionStore = new CaptionStore();
