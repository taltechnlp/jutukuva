/**
 * Streaming Text Plugin
 *
 * Inserts streaming ASR text at document end without disrupting user's cursor
 *
 * Key behaviors:
 * - Appends all incoming words to the last paragraph
 * - Deduplication is handled outside this plugin (in SpeechEditor.svelte)
 * - Never deletes user content
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { StreamingTextEvent } from '../utils/types';

export interface StreamingTextState {
	createNewParagraphOnNextText: boolean; // Set when VAD detects speech end
}

export const streamingTextKey = new PluginKey<StreamingTextState>('streamingText');

/**
 * Insert streaming text - append-only operation
 * Appends all incoming words to the last paragraph
 */
function insertStreamingText(
	tr: Transaction,
	state: EditorState,
	pluginState: StreamingTextState | undefined,
	text: string
): Transaction {
	const schema = state.schema;
	let doc = tr.doc;

	// Find the last paragraph
	let lastPara: any = null;
	let lastParaPos = 0;

	doc.descendants((node, pos) => {
		if (node.type.name === 'paragraph') {
			lastPara = node;
			lastParaPos = pos;
		}
	});

	// Check if we should create a new paragraph (after VAD speech end)
	const shouldCreateNewParagraph = pluginState?.createNewParagraphOnNextText;

	if (shouldCreateNewParagraph && lastPara && lastPara.content.size > 0) {
		const newPara = schema.nodes.paragraph.create();
		const insertPos = lastParaPos + lastPara.nodeSize;
		tr.insert(insertPos, newPara);

		// Update doc reference
		doc = tr.doc;

		// Re-find the new paragraph
		lastPara = null;
		lastParaPos = 0;
		doc.descendants((node, pos) => {
			if (node.type.name === 'paragraph') {
				lastPara = node;
				lastParaPos = pos;
			}
		});

		tr.setMeta('clearNewParagraphFlag', true);
	}

	// If no paragraph found, create one
	if (!lastPara) {
		const newPara = schema.nodes.paragraph.create();
		tr.insert(1, newPara);
		lastParaPos = 1;
		lastPara = newPara;
		doc = tr.doc;
	}

	// Split incoming text into words
	const incomingWords = text.trim().split(/\s+/).filter((w) => w.length > 0);

	if (incomingWords.length === 0) {
		return tr;
	}

	// Check if first word starts with punctuation (no space needed before it)
	const punctuationRegex = /^[.,!?;:\-–—""''„"«»]/;

	// Append all incoming words to the last paragraph
	let insertPos = lastParaPos + 1 + (lastPara?.content.size || 0);
	let needsSpaceBefore = lastPara?.content.size > 0;

	for (let i = 0; i < incomingWords.length; i++) {
		const word = incomingWords[i];

		// Don't add space before punctuation
		const startsWithPunctuation = punctuationRegex.test(word);

		// Add space before word if needed (but not before punctuation)
		if (needsSpaceBefore && !startsWithPunctuation) {
			const spaceNode = schema.text(' ');
			tr.insert(insertPos, spaceNode);
			insertPos += 1;
		}
		needsSpaceBefore = true;

		// Create plain text node (no marks)
		const textNode = schema.text(word);
		tr.insert(insertPos, textNode);
		insertPos += word.length;
	}

	// Mark transaction to not add to history
	tr.setMeta('addToHistory', false);

	return tr;
}

/**
 * Create streaming text plugin
 */
export function streamingTextPlugin(collaborationManager?: any) {
	return new Plugin<StreamingTextState>({
		key: streamingTextKey,

		state: {
			init(): StreamingTextState {
				return {
					createNewParagraphOnNextText: false
				};
			},

			apply(tr, value): StreamingTextState {
				let newValue = value;

				// Handle VAD speech end - set flag to create new paragraph
				if (tr.getMeta('vadSpeechEnd')) {
					newValue = {
						...newValue,
						createNewParagraphOnNextText: true
					};
				}

				// Clear the flag after it's been used
				if (tr.getMeta('clearNewParagraphFlag')) {
					newValue = {
						...newValue,
						createNewParagraphOnNextText: false
					};
				}

				return newValue;
			}
		},

		// Handle incoming streaming text
		appendTransaction(transactions, oldState, newState) {
			const tr = newState.tr;
			let modified = false;

			for (const transaction of transactions) {
				const streamingEvent = transaction.getMeta('insertStreamingText') as
					| StreamingTextEvent
					| undefined;

				if (streamingEvent && streamingEvent.text) {
					// Get plugin state from OLD state
					const pluginState = streamingTextKey.getState(oldState);

					insertStreamingText(tr, oldState, pluginState, streamingEvent.text);

					// Propagate metadata so other plugins can detect ASR text
					tr.setMeta('insertStreamingText', streamingEvent);

					modified = true;
				}
			}

			return modified ? tr : null;
		}
	});
}

/**
 * Helper: Insert streaming text from external source
 */
export function insertStreamingTextCommand(
	state: EditorState,
	dispatch: (tr: Transaction) => void,
	event: StreamingTextEvent
): boolean {
	const tr = state.tr;
	tr.setMeta('insertStreamingText', event);
	dispatch(tr);
	return true;
}

/**
 * Helper: Signal VAD speech end to create new paragraph on next text
 */
export function signalVadSpeechEndCommand(
	state: EditorState,
	dispatch: (tr: Transaction) => void
): boolean {
	const tr = state.tr;
	tr.setMeta('vadSpeechEnd', true);
	tr.setMeta('addToHistory', false);
	dispatch(tr);
	return true;
}
