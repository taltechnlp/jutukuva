<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { history } from 'prosemirror-history';
	import { speechSchema } from './schema';
	import { wordApprovalPlugin, wordApprovalKey } from './plugins/wordApproval';
	import { keyboardShortcutsPlugin } from './plugins/keyboardShortcuts';
	import { streamingTextPlugin, insertStreamingTextCommand, signalVadSpeechEndCommand } from './plugins/streamingText';
	import { subtitleSegmentationPlugin, subtitleSegmentationKey } from './plugins/subtitleSegmentation';
	import { autoConfirmPlugin, autoConfirmKey, updateAutoConfirmConfig } from './plugins/autoConfirm';
	import type { EditorConfig, StreamingTextEvent, SubtitleSegment, Word, AutoConfirmConfig } from './utils/types';
	import Toolbar from './Toolbar.svelte';

	// Props
	let {
		config = {},
		class: className = ''
	}: {
		config?: EditorConfig;
		class?: string;
	} = $props();

	// Editor state
	let editorElement: HTMLDivElement;
	let editorView: EditorView | null = $state(null);
	let segments = $state<SubtitleSegment[]>([]);
	let wordCount = $state(0);
	let approvedCount = $state(0);
	let autoConfirmConfig = $state<AutoConfirmConfig>(
		config.autoConfirm || { enabled: true, timeoutSeconds: 5 }
	);
	let recordingStartTime = $state<number | null>(null);
	let autoScroll = $state(true);

	// Initialize editor
	onMount(() => {
		const state = EditorState.create({
			schema: speechSchema,
			doc: speechSchema.node('doc', null, [
				speechSchema.node('paragraph', null, [])
			]),
			plugins: [
				history(),
				wordApprovalPlugin(handleWordApproved),
				keyboardShortcutsPlugin(),
				streamingTextPlugin(),
				subtitleSegmentationPlugin(handleSegmentComplete),
				autoConfirmPlugin(autoConfirmConfig)
			]
		});

		editorView = new EditorView(editorElement, {
			state,
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

		// Count words (exclude whitespace)
		let totalWords = 0;
		let approvedWords = 0;
		state.doc.descendants((node) => {
			if (node.isText && node.marks.length > 0) {
				const wordMark = node.marks.find((mark) => mark.type.name === 'word');
				// Only count non-whitespace words
				if (wordMark && node.text && node.text.trim().length > 0) {
					totalWords++;
					if (wordMark.attrs.approved) {
						approvedWords++;
					}
				}
			}
		});
		wordCount = totalWords;
		approvedCount = approvedWords;
	}

	// Handle word approved
	function handleWordApproved(word: Word) {
		if (config.onWordApproved) {
			config.onWordApproved(word);
		}
	}

	// Handle segment complete
	function handleSegmentComplete(segment: SubtitleSegment) {
		if (config.onSubtitleEmit) {
			config.onSubtitleEmit(segment.srt, segment);
		}
	}

	// Handle auto-confirm config change
	function handleAutoConfirmChange(newConfig: AutoConfirmConfig) {
		if (!editorView) return;

		autoConfirmConfig = newConfig;
		updateAutoConfirmConfig(editorView.state, (tr) => {
			editorView?.dispatch(tr);
		}, newConfig);
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
		console.log('[EDITOR] insertStreamingText called:', {
			hasEditorView: !!editorView,
			text: event.text.substring(0, 50) + '...',
			isFinal: event.isFinal,
			start: event.start,
			end: event.end,
			recordingStartTime: recordingStartTime
		});

		if (!editorView) {
			console.error('[EDITOR] No editorView available!');
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
			console.log('[EDITOR] Enhanced timing:', { start: enhancedEvent.start, end: enhancedEvent.end });
		}

		insertStreamingTextCommand(editorView.state, (tr) => {
			editorView?.dispatch(tr);
		}, enhancedEvent);
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
		const { state, dispatch } = editorView;
		const tr = state.tr;
		tr.setMeta('undo', true);
		dispatch(tr);
	}

	// Public API: Redo
	export function redo() {
		if (!editorView) return;
		const { state, dispatch } = editorView;
		const tr = state.tr;
		tr.setMeta('redo', true);
		dispatch(tr);
	}
</script>

<div class="speech-editor-container {className}">
	<!-- Toolbar -->
	<Toolbar
		{wordCount}
		{approvedCount}
		{autoConfirmConfig}
		onUndo={() => undo()}
		onRedo={() => redo()}
		onAutoConfirmChange={handleAutoConfirmChange}
	/>

	<!-- Editor -->
	<div
		class="speech-editor"
		style:font-size={config.fontSize ? `${config.fontSize}px` : '16px'}
	>
		<div bind:this={editorElement}></div>
	</div>

	<!-- Status bar -->
	<div class="status-bar">
		<label class="auto-scroll-toggle">
			<input
				type="checkbox"
				checked={autoScroll}
				onchange={handleAutoScrollChange}
				aria-label="Enable auto-scroll"
			/>
			<span>Auto-scroll</span>
		</label>
		<span class="word-count">{approvedCount} / {wordCount} words approved</span>
	</div>
</div>

<style>
	.speech-editor-container {
		display: flex;
		flex-direction: column;
		border: 1px solid #ddd;
		border-radius: 8px;
		overflow: hidden;
		background: white;
	}

	.speech-editor {
		min-height: 300px;
		padding: 20px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		line-height: 2;
	}

	.speech-editor :global(.subtitle-segment) {
		margin-bottom: 1em;
		padding: 8px;
		border-left: 3px solid #e0e0e0;
		min-height: 1.6em;
	}

	.speech-editor :global(.word-final) {
		border-bottom: 2px solid rgba(76, 175, 80, 0.6); /* Solid green underline - stable, will auto-confirm */
		padding: 2px 0;
		cursor: pointer;
	}

	.speech-editor :global(.word-non-final) {
		border-bottom: 2px dashed rgba(255, 152, 0, 0.8); /* Dashed orange underline - unstable, may change */
		padding: 2px 0;
		cursor: pointer;
	}

	.speech-editor :global(.word-approved) {
		padding: 2px 0;
	}

	.speech-editor :global(.word-active) {
		background-color: rgba(33, 150, 243, 0.3); /* Blue highlight for arrow key selection */
		padding: 2px 4px;
		border-radius: 3px;
	}

	.speech-editor :global(.word-state-pending) {
		color: #757575;
	}

	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 16px;
		background-color: #f5f5f5;
		border-top: 1px solid #ddd;
		font-size: 13px;
		color: #666;
	}

	.auto-scroll-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #666;
		cursor: pointer;
		user-select: none;
	}

	.auto-scroll-toggle input {
		cursor: pointer;
	}

	.word-count {
		font-variant-numeric: tabular-nums;
	}
</style>
