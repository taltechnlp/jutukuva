<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { history, undo as pmUndo, redo as pmRedo } from 'prosemirror-history';
	import { speechSchema } from './schema';
	import { keyboardShortcutsPlugin } from './plugins/keyboardShortcuts';
	import { streamingTextPlugin, insertStreamingTextCommand, signalVadSpeechEndCommand } from './plugins/streamingText';
	import { subtitleSegmentationPlugin, subtitleSegmentationKey } from './plugins/subtitleSegmentation';
	import { textSnippetsPlugin, updateTextSnippetEntries, type TextSnippetEntry } from './plugins/textSnippets';
	import type { EditorConfig, StreamingTextEvent, SubtitleSegment, Word } from './utils/types';
	import type { CollaborationManager } from '$lib/collaboration/CollaborationManager';
	import Toolbar from './Toolbar.svelte';

	// Props
	let {
		config = {},
		class: className = '',
		collaborationManager = undefined,
		readOnly = false
	}: {
		config?: EditorConfig;
		class?: string;
		collaborationManager?: CollaborationManager;
		readOnly?: boolean;
	} = $props();

	// Editor state
	let editorElement: HTMLDivElement;
	let editorView: EditorView | null = $state(null);
	let segments = $state<SubtitleSegment[]>([]);
	let recordingStartTime = $state<number | null>(null);
	let autoScroll = $state(true);
	let textSnippetEntries = $state<TextSnippetEntry[]>([]);

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

	// Initialize editor
	onMount(async () => {
		// Load text snippets first
		await loadTextSnippetEntries();

		// Determine plugins based on collaboration mode
		const basePlugins = [
			keyboardShortcutsPlugin(),
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
		// In collaborative mode, don't provide initial doc - let ySyncPlugin manage it
		const stateConfig: any = {
			schema: speechSchema,
			plugins
		};

		// Only provide initial doc in solo mode
		if (!collaborationManager) {
			stateConfig.doc = speechSchema.node('doc', null, [
				speechSchema.node('paragraph', null, [])
			]);
		}

		const state = EditorState.create(stateConfig);

		editorView = new EditorView(editorElement, {
			state,
			editable: () => !readOnly,
			dispatchTransaction(transaction) {
				if (!editorView) return;

				const newState = editorView.state.apply(transaction);
				editorView.updateState(newState);

				// Update reactive state
				updateEditorState(newState);

				// Auto-scroll to bottom after document changes
				if (autoScroll && transaction.docChanged && editorElement) {
					requestAnimationFrame(() => {
						if (editorElement) {
							// Keep the bottom of the editor visible as content is added
							const rect = editorElement.getBoundingClientRect();
							const viewportHeight = window.innerHeight;

							// If bottom of editor is below viewport, scroll to keep it visible
							if (rect.bottom > viewportHeight) {
								const scrollAmount = rect.bottom - viewportHeight + 50; // 50px padding from bottom
								window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
							}
						}
					});
				}
			}
		});

		// Initial state update
		updateEditorState(state);
	});

	onDestroy(() => {
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

		// Calculate timing based on recording start time if timestamps are 0
		let enhancedEvent = event;
		if (recordingStartTime && (event.start === 0 || event.start === undefined)) {
			const currentTime = Date.now();
			const elapsedSeconds = (currentTime - recordingStartTime) / 1000;
			enhancedEvent = {
				...event,
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

<div class="flex flex-col bg-base-100 border border-base-300 rounded-lg overflow-hidden {className}">
	{#if !readOnly}
		<!-- Toolbar -->
		<Toolbar
			onUndo={() => undo()}
			onRedo={() => redo()}
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
