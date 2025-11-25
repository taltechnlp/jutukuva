<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { Node } from 'prosemirror-model';
	import { history, undo as pmUndo, redo as pmRedo } from 'prosemirror-history';
	import { initProseMirrorDoc } from 'y-prosemirror';
	import { writable, type Writable } from 'svelte/store';
	import { speechSchema } from './schema';
	import { keyboardShortcutsPlugin, speakerDropdownPlugin, speakerDropdownKey } from './plugins/keyboardShortcuts';
	import { streamingTextPlugin, insertStreamingTextCommand, signalVadSpeechEndCommand } from './plugins/streamingText';
	import { subtitleSegmentationPlugin, subtitleSegmentationKey } from './plugins/subtitleSegmentation';
	import { textSnippetsPlugin, updateTextSnippetEntries, type TextSnippetEntry } from './plugins/textSnippets';
	import type { EditorConfig, StreamingTextEvent, SubtitleSegment, Word } from './utils/types';
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
		collaborationManager?: CollaborationManager;
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
	let segments = $state<SubtitleSegment[]>([]);
	let recordingStartTime = $state<number | null>(null);
	let autoScroll = $state(true);
	let textSnippetEntries = $state<TextSnippetEntry[]>([]);

	// Auto-save state
	let autoSaveInterval: ReturnType<typeof setInterval> | null = null;
	const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

	// Deduplication state (kept OUTSIDE editor to avoid race conditions)
	// This tracks all words that have been "committed" (exist in previous paragraphs)
	let committedWords = new Set<string>();

	/**
	 * Normalize a word for deduplication comparison
	 * Strips punctuation and converts to lowercase
	 */
	function normalizeForDedup(word: string): string {
		return word.replace(/[.,!?;:\-–—""''„"«»]/g, '').toLowerCase();
	}

	/**
	 * Commit words BEFORE cursor position to the committed set
	 * Called when user creates a new paragraph (Enter key)
	 *
	 * IMPORTANT: Only commits words before the cursor, not after.
	 * When Enter is pressed mid-paragraph, words after cursor move to new paragraph
	 * and should NOT be committed (they're still "active" ASR text).
	 */
	function commitCurrentParagraphWords() {
		if (!editorView) return;

		// Get cursor position BEFORE the split transaction is applied
		const cursorPos = editorView.state.selection.from;

		// Only commit words that END before the cursor position
		editorView.state.doc.descendants((node, pos) => {
			if (node.isText && node.marks.length > 0) {
				const wordMark = node.marks.find((mark) => mark.type.name === 'word');
				if (wordMark && node.text && node.text.trim().length > 0) {
					// Only commit if this word ends before or at cursor position
					const wordEnd = pos + node.nodeSize;
					if (wordEnd <= cursorPos) {
						committedWords.add(normalizeForDedup(node.text.trim()));
					}
				}
			}
		});
	}

	/**
	 * Initialize committedWords from existing document content
	 * Called when editor mounts with existing content (e.g., after session switch)
	 *
	 * IMPORTANT: Only commits words from paragraphs BEFORE the last one.
	 * The last paragraph is "active" and ASR should be able to update it.
	 */
	function initializeCommittedWordsFromDoc() {
		if (!editorView) return;

		committedWords.clear();
		const doc = editorView.state.doc;
		const lastParaIndex = doc.childCount - 1;

		// Only commit words from paragraphs BEFORE the last one
		doc.forEach((paragraph, offset, index) => {
			if (index < lastParaIndex) {
				paragraph.descendants((node) => {
					if (node.isText && node.marks.length > 0) {
						const wordMark = node.marks.find((mark) => mark.type.name === 'word');
						if (wordMark && node.text && node.text.trim().length > 0) {
							committedWords.add(normalizeForDedup(node.text.trim()));
						}
					}
				});
			}
		});

		console.log('[EDITOR] Initialized committedWords with', committedWords.size, 'words from', lastParaIndex, 'previous paragraphs (excluding active last paragraph)');
	}

	/**
	 * Filter incoming ASR text to remove duplicates
	 * Returns only the new words that haven't been committed yet
	 */
	function filterDuplicates(text: string): string {
		const words = text.trim().split(/\s+/).filter(w => w.length > 0);
		const newWords = words.filter(word => !committedWords.has(normalizeForDedup(word)));
		return newWords.join(' ');
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
			collaborationManager.updateSpeaker(id, name);
		} else {
			speakerStore.updateSpeaker(id, name);
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
		const unsubscribeSpeakers = speakerStore.subscribe((storeSpeakers) => {
			if (!collaborationManager) {
				speakers = storeSpeakers;
			}
		});

		// Determine plugins based on collaboration mode
		const basePlugins = [
			keyboardShortcutsPlugin(),
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
				if (!editorView) return;

				// Detect paragraph creation (Enter key) and commit words BEFORE applying
				// This ensures deduplication state is updated synchronously
				if (transaction.getMeta('manualParagraphCreated')) {
					commitCurrentParagraphWords();
				}

				const newState = editorView.state.apply(transaction);
				editorView.updateState(newState);

				// Update reactive state
				updateEditorState(newState);

				// Auto-scroll to bottom after document changes
				if (autoScroll && transaction.docChanged && containerElement) {
					requestAnimationFrame(() => {
						if (containerElement) {
							// Keep the bottom of the editor container visible as content is added
							// This includes the status bar at the bottom
							const rect = containerElement.getBoundingClientRect();
							const viewportHeight = window.innerHeight;

							// If bottom of container is below viewport, scroll to keep it visible
							if (rect.bottom > viewportHeight) {
								const scrollAmount = rect.bottom - viewportHeight + 20; // 20px padding from bottom
								window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
							}
						}
					});
				}
			}
		});

		// Initial state update
		updateEditorState(state);

		// Initialize deduplication set from existing content
		// This is crucial when remounting with preserved content (e.g., session switch)
		initializeCommittedWordsFromDoc();

		// Debug: Log initial editor document
		console.log('[SpeechEditor] Initial doc after mount:', editorView?.state.doc.toJSON());
		console.log('[SpeechEditor] Initial doc childCount:', editorView?.state.doc.childCount);

		// Start auto-save interval (for both solo and collaborative modes)
		// In collaborative mode, this serves as a local backup
		if (sessionId) {
			autoSaveInterval = setInterval(saveEditorState, AUTO_SAVE_INTERVAL_MS);
		}

		// Return cleanup function
		return () => {
			unsubscribeSpeakers();
		};
	});

	onDestroy(() => {
		// Clear auto-save interval
		if (autoSaveInterval) {
			clearInterval(autoSaveInterval);
			autoSaveInterval = null;
		}

		if (editorView) {
			editorView.destroy();
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
	}

	// Public API: Stop timing for recording session
	export function stopTiming() {
		recordingStartTime = null;

		// Send a final empty transaction to signal end of streaming
		// This will clear the streaming flag and allow auto-confirm to start
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

		// CRITICAL: Filter duplicates BEFORE sending to editor
		// This prevents ASR buffer from adding words from previous paragraphs
		const filteredText = filterDuplicates(event.text);

		// Skip if all words were filtered out
		if (!filteredText) {
			return;
		}

		// Calculate timing based on recording start time if timestamps are 0
		let enhancedEvent: StreamingTextEvent = {
			...event,
			text: filteredText // Use filtered text
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
			wordCount,
			approvedCount
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
