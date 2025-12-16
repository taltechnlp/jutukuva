<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { Node } from 'prosemirror-model';
	import { history, undo as pmUndo, redo as pmRedo } from 'prosemirror-history';
	import { baseKeymap } from 'prosemirror-commands';
	import { keymap } from 'prosemirror-keymap';
	import { initProseMirrorDoc } from 'y-prosemirror';
	import { writable, type Writable } from 'svelte/store';
	import { speechSchema } from './schema';
	import { keyboardShortcutsPlugin, speakerDropdownPlugin, speakerDropdownKey } from './plugins/keyboardShortcuts';
	import { streamingTextPlugin, insertStreamingTextCommand, signalVadSpeechEndCommand } from './plugins/streamingText';
	import { subtitleSegmentationPlugin, subtitleSegmentationKey } from './plugins/subtitleSegmentation';
	import { textSnippetsPlugin, updateTextSnippetEntries, type TextSnippetEntry } from './plugins/textSnippets';
	import type { EditorConfig, StreamingTextEvent, SubtitleSegment } from './utils/types';
	import type { CollaborationManager } from '$lib/collaboration/CollaborationManager';
	import type { Speaker } from '$lib/collaboration/types';
	import { speakerStore } from '$lib/stores/speakerStore';
	import { createParagraphNodeView, type ParagraphNodeViewContext } from './nodeViews/paragraphNodeView';
	import Toolbar from './Toolbar.svelte';

	// Shared speaker store for all NodeViews - created at module level so all paragraphs share it
	const sharedSpeakersStore: Writable<Speaker[]> = writable([]);

	// Props
	let {
		config = {},
		class: className = '',
		collaborationManager = undefined,
		readOnly = false,
		sessionId = ''
	}: {
		config?: EditorConfig;
		class?: string;
		collaborationManager?: CollaborationManager | null;
		readOnly?: boolean;
		sessionId?: string;
	} = $props();

	// Speaker state
	let speakers = $state<Speaker[]>([]);

	// Keep shared store in sync with speakers state
	$effect(() => {
		sharedSpeakersStore.set(speakers);
	});

	// Editor state
	let containerElement: HTMLDivElement;
	let editorElement: HTMLDivElement;
	let editorView: EditorView | null = $state(null);
	let isDestroyed = false; // Flag to prevent updates after destroy
	let segments = $state<SubtitleSegment[]>([]);
	let recordingStartTime = $state<number | null>(null);
	let autoScroll = $state(true);
	let textSnippetEntries = $state<TextSnippetEntry[]>([]);
	let wordCount = $state(0);

	// Auto-save state
	let autoSaveInterval: ReturnType<typeof setInterval> | null = null;
	const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

	// Auto-scroll resize observer
	let resizeObserver: ResizeObserver | null = null;

	// Store unsubscribe function for speaker store
	let unsubscribeSpeakers: (() => void) | null = null;

	// ASR deduplication state - pure diff-based, no editor knowledge
	// Tracks the normalized characters we've already sent to the editor
	let sentNormalized = '';

	/**
	 * Normalize text for comparison (lowercase, remove punctuation and whitespace)
	 */
	function normalizeForComparison(text: string): string {
		return text.replace(/[.,!?;:\-–—""''„"«»\s]/g, '').toLowerCase();
	}

	/**
	 * Extract only NEW content from incoming ASR text
	 * Pure diff against what we've already sent - no editor knowledge
	 *
	 * Handles model quirks:
	 * - Capitalization changes: "Üks" vs "üks"
	 * - Punctuation changes: "kuus" vs "kuus,"
	 * - Compound words: "kuus teist" → "kuusteist"
	 */
	function extractNewWords(text: string): string {
		const incomingText = text.trim();
		if (!incomingText) {
			return '';
		}

		const incomingNormalized = normalizeForComparison(incomingText);

		// Find where the new content starts by checking character by character
		// The incoming normalized text should start with what we've already sent
		let matchLen = 0;
		const minLen = Math.min(sentNormalized.length, incomingNormalized.length);

		for (let i = 0; i < minLen; i++) {
			if (sentNormalized[i] === incomingNormalized[i]) {
				matchLen++;
			} else {
				break;
			}
		}

		// If incoming doesn't start with what we sent, something is wrong
		// (model's sliding window dropped content) - reset and take all
		if (matchLen < sentNormalized.length && incomingNormalized.length >= sentNormalized.length) {
			// Sliding window moved - reset context
			sentNormalized = incomingNormalized;
			return incomingText;
		}

		// Find the position in the original text where new content starts
		// We need to map from normalized position back to original text
		if (incomingNormalized.length > sentNormalized.length) {
			// There's new content after what we've sent
			const newNormalizedContent = incomingNormalized.slice(sentNormalized.length);

			// Find where this new content starts in the original text
			let normalizedPos = 0;
			let originalPos = 0;

			for (let i = 0; i < incomingText.length; i++) {
				const char = incomingText[i];
				const normalizedChar = normalizeForComparison(char);

				if (normalizedChar) {
					if (normalizedPos >= sentNormalized.length) {
						// We've passed the already-sent content
						originalPos = i;
						break;
					}
					normalizedPos++;
				}
			}

			// Extract new content from original text (preserving punctuation/formatting)
			const newContent = incomingText.slice(originalPos).trim();

			if (newContent) {
				sentNormalized = incomingNormalized;
				return newContent;
			}
		}

		return '';
	}

	/**
	 * Reset ASR context (call on session start/stop)
	 */
	function resetAsrContext() {
		sentNormalized = '';
	}

	// Load text snippet entries from database
	async function loadTextSnippetEntries() {
		if (typeof window !== 'undefined' && window.db) {
			try {
				const entries = await window.db.getActiveEntries();
				textSnippetEntries = entries.map(entry => ({
					trigger: entry.trigger,
					replacement: entry.replacement,
					dictionary_id: entry.dictionary_id,
					dictionary_name: entry.dictionary_name
				}));
			} catch (error) {
				console.error('Failed to load text snippet entries:', error);
				textSnippetEntries = [];
			}
		}
	}

	// Load speakers from database (solo mode)
	async function loadSpeakers() {
		if (!sessionId || collaborationManager) return;

		if (typeof window !== 'undefined' && window.db) {
			try {
				const dbSpeakers = await window.db.getSessionSpeakers(sessionId);
				speakerStore.initFromDb(dbSpeakers);
				speakers = dbSpeakers;
			} catch (error) {
				console.error('Failed to load speakers:', error);
			}
		}
	}

	// Save speakers to database (solo mode)
	async function saveSpeakers() {
		if (!sessionId || collaborationManager) return;

		if (typeof window !== 'undefined' && window.db) {
			try {
				await window.db.setSessionSpeakers(sessionId, speakers);
			} catch (error) {
				console.error('Failed to save speakers:', error);
			}
		}
	}

	// Save editor state to database (for both modes as backup)
	async function saveEditorState() {
		if (!editorView || !sessionId) return;

		if (typeof window !== 'undefined' && window.db) {
			try {
				const docJson = editorView.state.doc.toJSON();
				await window.db.saveEditorState(sessionId, JSON.stringify(docJson));
			} catch (error) {
				console.error('Failed to save editor state:', error);
			}
		}
	}

	// Speaker management functions for NodeView context
	function getSpeakers(): Speaker[] {
		if (collaborationManager) {
			return collaborationManager.getSpeakers();
		}
		return speakers;
	}

	function getSpeaker(id: string): Speaker | undefined {
		if (collaborationManager) {
			return collaborationManager.getSpeaker(id);
		}
		return speakers.find(s => s.id === id);
	}

	function addSpeaker(name: string): Speaker {
		let newSpeaker: Speaker;
		if (collaborationManager) {
			newSpeaker = collaborationManager.addSpeaker(name);
		} else {
			newSpeaker = speakerStore.addSpeaker(name);
			speakers = speakerStore.getSpeakers();
			saveSpeakers();
		}
		return newSpeaker;
	}

	function removeSpeaker(id: string): void {
		if (collaborationManager) {
			collaborationManager.removeSpeaker(id);
		} else {
			speakerStore.removeSpeaker(id);
			speakers = speakerStore.getSpeakers();
			saveSpeakers();
		}
	}

	function updateSpeaker(id: string, name: string): void {
		if (collaborationManager) {
			collaborationManager.updateSpeaker(id, { name });
		} else {
			speakerStore.updateSpeaker(id, { name });
			speakers = speakerStore.getSpeakers();
			saveSpeakers();
		}
	}

	// Create NodeView context
	function createNodeViewContext(): ParagraphNodeViewContext {
		return {
			speakersStore: sharedSpeakersStore,
			getSpeaker,
			addSpeaker,
			readOnly
		};
	}

	// Initialize editor
	onMount(async () => {
		// Load text snippets first
		await loadTextSnippetEntries();

		// Load speakers
		await loadSpeakers();

		// Subscribe to speaker changes in collaborative mode
		if (collaborationManager) {
			// Initial speakers from Yjs
			speakers = collaborationManager.getSpeakers();

			// Observe Yjs speaker changes (from remote collaborators)
			if (collaborationManager.speakersMap) {
				collaborationManager.speakersMap.observe(() => {
					speakers = collaborationManager.getSpeakers();
					// Also persist to local DB as backup
					if (sessionId && typeof window !== 'undefined' && window.db) {
						window.db.setSessionSpeakers(sessionId, speakers);
					}
				});
			}
		}

		// Subscribe to speaker store changes in solo mode
		unsubscribeSpeakers = speakerStore.subscribe((storeSpeakers) => {
			if (!collaborationManager) {
				speakers = storeSpeakers;
			}
		});

		// Determine plugins based on collaboration mode
		const basePlugins = [
			keyboardShortcutsPlugin(),  // Custom shortcuts first (takes precedence)
			keymap(baseKeymap),          // Base keymap for standard editing (joinBackward, etc.)
			speakerDropdownPlugin(),
			streamingTextPlugin(collaborationManager),
			subtitleSegmentationPlugin(handleSegmentComplete),
			textSnippetsPlugin({ entries: textSnippetEntries })
		];

		// Add collaboration or history plugins
		let plugins;
		if (collaborationManager) {
			// In collaborative mode: use Yjs plugins
			// Don't include cursor tracking in read-only mode
			const yjsPlugins = collaborationManager.getProseMirrorPlugins({
				includeCursor: !readOnly
			});

			// Debug: Check Yjs state when editor mounts
			const xmlFragment = collaborationManager.ydoc.getXmlFragment('prosemirror');
			console.log('[SpeechEditor] Yjs XmlFragment length at mount:', xmlFragment.length);
			console.log('[SpeechEditor] Yjs XmlFragment content:', xmlFragment.toJSON());

			plugins = [
				...yjsPlugins,
				...basePlugins
			];
		} else {
			// Solo mode: use regular history
			plugins = [
				history(),
				...basePlugins
			];
		}

		// Create editor state
		const stateConfig: any = {
			schema: speechSchema,
			plugins
		};

		// Set initial doc based on mode
		if (collaborationManager) {
			// In collaborative mode: use initProseMirrorDoc to properly create doc from Yjs
			const xmlFragment = collaborationManager.ydoc.getXmlFragment('prosemirror');
			if (xmlFragment.length > 0) {
				// Yjs has content - initialize doc from it
				const { doc } = initProseMirrorDoc(xmlFragment, speechSchema);
				stateConfig.doc = doc;
				console.log('[EDITOR] Initialized doc from Yjs, childCount:', doc.childCount);
			} else {
				// Yjs is empty - create empty doc
				stateConfig.doc = speechSchema.node('doc', null, [
					speechSchema.node('paragraph', null, [])
				]);
				console.log('[EDITOR] Created empty doc for new session');
			}
		} else {
			// Solo mode: try to restore from database first
			let initialDoc = null;

			if (sessionId && typeof window !== 'undefined' && window.db) {
				try {
					const savedState = await window.db.getEditorState(sessionId);
					if (savedState) {
						const docJson = JSON.parse(savedState);
						initialDoc = Node.fromJSON(speechSchema, docJson);
						console.log('[EDITOR] Restored state from database');
					}
				} catch (error) {
					console.error('[EDITOR] Failed to restore state:', error);
				}
			}

			// Use restored doc or create empty one
			stateConfig.doc = initialDoc || speechSchema.node('doc', null, [
				speechSchema.node('paragraph', null, [])
			]);
		}

		const state = EditorState.create(stateConfig);

		// Create NodeView context
		const nodeViewContext = createNodeViewContext();

		editorView = new EditorView(editorElement, {
			state,
			editable: () => !readOnly,
			nodeViews: {
				paragraph: (node, view, getPos) =>
					createParagraphNodeView(node, view, getPos, nodeViewContext)
			},
			dispatchTransaction(transaction) {
				if (!editorView || isDestroyed) return;

				const newState = editorView.state.apply(transaction);

				// Double-check editorView is still valid before updating
				if (!editorView || isDestroyed) return;

				editorView.updateState(newState);

				// Update reactive state
				updateEditorState(newState);
			}
		});

		// Initial state update
		updateEditorState(state);

		// Debug: Log initial editor document
		console.log('[SpeechEditor] Initial doc after mount:', editorView?.state.doc.toJSON());
		console.log('[SpeechEditor] Initial doc childCount:', editorView?.state.doc.childCount);

		// Start auto-save interval (for both solo and collaborative modes)
		// In collaborative mode, this serves as a local backup
		if (sessionId) {
			autoSaveInterval = setInterval(saveEditorState, AUTO_SAVE_INTERVAL_MS);
		}

		// Set up ResizeObserver for auto-scroll
		// This detects when the editor container grows and scrolls to keep it visible
		resizeObserver = new ResizeObserver(() => {
			if (autoScroll && containerElement) {
				const rect = containerElement.getBoundingClientRect();
				const viewportHeight = window.innerHeight;

				// If bottom of container is below viewport, scroll to keep it visible
				if (rect.bottom > viewportHeight) {
					window.scrollBy({
						top: rect.bottom - viewportHeight + 20,
						behavior: 'smooth'
					});
				}
			}
		});

		if (containerElement) {
			resizeObserver.observe(containerElement);
		}
	});

	onDestroy(() => {
		// Set destroyed flag first to prevent any pending callbacks from updating
		isDestroyed = true;

		// Unsubscribe from speaker store
		if (unsubscribeSpeakers) {
			unsubscribeSpeakers();
			unsubscribeSpeakers = null;
		}

		// Clear auto-save interval
		if (autoSaveInterval) {
			clearInterval(autoSaveInterval);
			autoSaveInterval = null;
		}

		// Clean up resize observer
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}

		// Destroy editor view and null out reference
		if (editorView) {
			const view = editorView;
			editorView = null;
			view.destroy();
		}
	});

	// Update reactive state from editor state
	function updateEditorState(state: EditorState) {
		// Update segments
		const segmentPluginState = subtitleSegmentationKey.getState(state);
		if (segmentPluginState) {
			segments = segmentPluginState.segments;
		}
	}

	// Handle segment complete
	function handleSegmentComplete(segment: SubtitleSegment) {
		if (config.onSubtitleEmit) {
			config.onSubtitleEmit(segment.srt, segment);
		}
	}

	// Handle auto-scroll toggle
	function handleAutoScrollChange() {
		autoScroll = !autoScroll;
	}

	// Public API: Start timing for recording session
	export function startTiming() {
		recordingStartTime = Date.now();
		resetAsrContext();
	}

	// Public API: Stop timing for recording session
	export function stopTiming() {
		recordingStartTime = null;
		resetAsrContext();

		// Send a final transaction to signal end of streaming
		if (editorView) {
			const tr = editorView.state.tr;
			tr.setMeta('streamingEnded', true);
			tr.setMeta('recordingEnded', true); // Signal to create final subtitle segment
			editorView.dispatch(tr);
		}
	}

	// Public API: Insert streaming text
	export function insertStreamingText(event: StreamingTextEvent) {
		if (!editorView) {
			console.error('No editorView available!');
			return;
		}

		// Extract only new words (diff against last ASR text)
		const newText = extractNewWords(event.text);

		// Skip if no new words
		if (!newText) {
			return;
		}

		// Calculate timing based on recording start time if timestamps are 0
		let enhancedEvent: StreamingTextEvent = {
			...event,
			text: newText
		};

		if (recordingStartTime && (event.start === 0 || event.start === undefined)) {
			const currentTime = Date.now();
			const elapsedSeconds = (currentTime - recordingStartTime) / 1000;
			enhancedEvent = {
				...enhancedEvent,
				start: elapsedSeconds - 0.5, // Estimate start slightly before current time
				end: elapsedSeconds
			};
		}

		insertStreamingTextCommand(editorView.state, (tr) => {
			editorView?.dispatch(tr);
		}, enhancedEvent);
	}

	// Public API: Reload text snippet entries from database
	export async function reloadTextSnippetEntries() {
		await loadTextSnippetEntries();
		if (editorView) {
			updateTextSnippetEntries(editorView, textSnippetEntries);
		}
	}

	// Public API: Signal VAD speech end (to create new paragraph on next text)
	export function signalVadSpeechEnd() {
		if (!editorView) return;

		signalVadSpeechEndCommand(editorView.state, (tr) => {
			editorView?.dispatch(tr);
		});
	}

	// Public API: Get current state
	export function getState() {
		return {
			segments,
			wordCount
		};
	}

	// Public API: Save editor state to database
	export function saveState() {
		return saveEditorState();
	}

	// Public API: Check if editor has content (for resume detection)
	export function hasContent(): boolean {
		if (!editorView) return false;

		// Check if there's any text content in the document
		let hasText = false;
		editorView.state.doc.descendants((node) => {
			if (node.isText && node.text && node.text.trim().length > 0) {
				hasText = true;
				return false; // Stop traversal
			}
		});
		return hasText;
	}

	// Public API: Get document as JSON (for session initialization)
	export function getDocJSON(): object | null {
		if (!editorView) return null;
		return editorView.state.doc.toJSON();
	}

	// Public API: Undo
	export function undo() {
		if (!editorView) return;
		pmUndo(editorView.state, (tr) => {
			tr.setMeta('isHistoryAction', true);
			editorView?.dispatch(tr);
		});
	}

	// Public API: Redo
	export function redo() {
		if (!editorView) return;
		pmRedo(editorView.state, (tr) => {
			tr.setMeta('isHistoryAction', true);
			editorView?.dispatch(tr);
		});
	}
</script>

<div bind:this={containerElement} class="flex flex-col bg-base-100 border border-base-300 rounded-lg overflow-hidden {className}">
	{#if !readOnly}
		<!-- Toolbar -->
		<Toolbar
			onUndo={() => undo()}
			onRedo={() => redo()}
			{speakers}
			onAddSpeaker={addSpeaker}
			onRemoveSpeaker={removeSpeaker}
			onUpdateSpeaker={updateSpeaker}
		/>
	{/if}

	<!-- Editor -->
	<div
		class="speech-editor"
		style:font-size={config.fontSize ? `${config.fontSize}px` : '16px'}
	>
		<div bind:this={editorElement}></div>
	</div>

	{#if !readOnly}
		<!-- Status bar -->
		<div class="status-bar">
			<label class="auto-scroll-toggle">
				<input
					type="checkbox"
					class="checkbox checkbox-sm"
					checked={autoScroll}
					onchange={handleAutoScrollChange}
					aria-label={$_('dictate.autoScroll')}
				/>
				<span>{$_('dictate.autoScroll')}</span>
			</label>
		</div>
	{/if}
</div>

<style>

	.speech-editor {
		min-height: 300px;
		padding: 20px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		line-height: 2;
	}

	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 16px;
		background-color: var(--fallback-b2, oklch(var(--b2) / 1));
		border-top: 1px solid var(--fallback-b3, oklch(var(--b3) / 1));
		font-size: 13px;
		color: var(--fallback-bc, oklch(var(--bc) / 0.6));
	}

	.auto-scroll-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--fallback-bc, oklch(var(--bc) / 0.6));
		cursor: pointer;
		user-select: none;
	}

	.auto-scroll-toggle input {
		cursor: pointer;
	}
</style>
