/**
 * Streaming Text Plugin
 *
 * Inserts streaming ASR text at document end without disrupting user's cursor
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import { v4 as uuidv4 } from 'uuid';
import type { StreamingTextEvent } from '../utils/types';

export interface StreamingTextState {
	buffer: string[];
	pendingText: string;
	currentTime: number;
	previousIncomingText: string; // Previous ASR result for final-word detection
	createNewParagraphOnNextText: boolean; // Set when VAD detects speech end
}

export const streamingTextKey = new PluginKey<StreamingTextState>('streamingText');

/**
 * Insert streaming text with final-word detection
 * Words that appear in both previous and current ASR results are marked as "final"
 * Final words are IMMUTABLE - never modified or deleted
 */
function insertStreamingText(
	tr: Transaction,
	state: EditorState,
	text: string,
	startTime?: number,
	endTime?: number,
	isFinal?: boolean
): Transaction {
	const schema = state.schema;
	let doc = tr.doc;

	// Find the last paragraph by traversing from the end
	let lastPara: any = null;
	let lastParaPos = 0;

	doc.descendants((node, pos) => {
		if (node.type.name === 'paragraph') {
			lastPara = node;
			lastParaPos = pos;
		}
	});

	// Check if we should create a new paragraph (after VAD speech end)
	const pluginState = streamingTextKey.getState(state);
	const shouldCreateNewParagraph = pluginState?.createNewParagraphOnNextText;

	// Get previous ASR result for final-word detection
	// IMPORTANT: Check this BEFORE creating new paragraph
	// Use empty string if we're about to create a new paragraph (don't compare across paragraphs)
	const previousIncomingText = shouldCreateNewParagraph ? '' : (pluginState?.previousIncomingText || '');

	console.log('[FINAL-WORD] shouldCreateNewParagraph:', shouldCreateNewParagraph, 'previousIncomingText:', previousIncomingText.substring(0, 50));

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

	// CRITICAL: When creating a new paragraph, deduplicate incoming text against ALL previous paragraphs
	// ASR buffer doesn't clear when recording continues, so it includes text from previous paragraphs
	let filteredText = text;
	if (shouldCreateNewParagraph) {
		const wordsFromPreviousParagraphs = new Set<string>();

		// Collect all words from all previous paragraphs
		doc.descendants((node, pos) => {
			// Only scan paragraphs before the current (last) one
			if (pos < lastParaPos) {
				if (node.isText && node.marks.length > 0) {
					const wordMark = node.marks.find((mark) => mark.type.name === 'word');
					if (wordMark && node.text && node.text.trim().length > 0) {
						wordsFromPreviousParagraphs.add(node.text.trim());
					}
				}
			}
		});

		// Filter incoming text to remove words that exist in previous paragraphs
		const incomingWordsList = text.trim().split(/\s+/).filter(w => w.length > 0);
		const filteredWordsList = incomingWordsList.filter(word => !wordsFromPreviousParagraphs.has(word));
		filteredText = filteredWordsList.join(' ');

		console.log('[FINAL-WORD] New paragraph - filtered out', incomingWordsList.length - filteredWordsList.length, 'words from previous paragraphs');
		console.log('[FINAL-WORD] Original text length:', text.length, 'Filtered text length:', filteredText.length);
	}

	// Split filtered text into words for insertion
	const incomingWords = filteredText.trim().split(/\s+/).filter(w => w.length > 0);

	console.log('[STREAMING] Incoming (filtered):', filteredText);
	console.log('[STREAMING] Will process', incomingWords.length, 'words');

	const paraStart = lastParaPos + 1;
	const paraEnd = lastParaPos + lastPara.nodeSize - 1;

	// Step 1: Collect existing words in order (approved and non-approved)
	const existingWords: Array<{ text: string; approved: boolean; id: string; pos: number; nodeSize: number }> = [];

	doc.nodesBetween(paraStart, paraEnd, (node, pos) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark && node.text && node.text.trim().length > 0) {
				existingWords.push({
					text: node.text.trim(),
					approved: wordMark.attrs.approved,
					id: wordMark.attrs.id,
					pos: pos,
					nodeSize: node.nodeSize
				});
			}
		}
	});

	console.log('[STREAMING] Existing words:', existingWords.length, 'approved:', existingWords.filter(w => w.approved).length);

	// Step 2: Match incoming words against ALL existing words (approved + non-approved)
	// Find the first position where they differ
	let matchLength = 0;

	for (let i = 0; i < Math.min(existingWords.length, incomingWords.length); i++) {
		if (existingWords[i].text === incomingWords[i]) {
			matchLength++;
		} else {
			// Words differ - stop matching
			break;
		}
	}

	console.log('[STREAMING] Matched', matchLength, '/', existingWords.length, 'existing words with incoming');

	// Step 3: Delete only NON-APPROVED words after the match point
	// Never delete approved words (they're immutable)
	const wordsToDelete: Array<{ pos: number; nodeSize: number }> = [];

	for (let i = matchLength; i < existingWords.length; i++) {
		if (!existingWords[i].approved) {
			wordsToDelete.push({
				pos: existingWords[i].pos,
				nodeSize: existingWords[i].nodeSize
			});
			console.log('[STREAMING] Deleting changed word:', existingWords[i].text);
		} else {
			console.log('[STREAMING] Preserving approved word:', existingWords[i].text);
		}
	}

	// Delete in reverse order to preserve positions
	wordsToDelete.sort((a, b) => b.pos - a.pos);
	for (const { pos, nodeSize } of wordsToDelete) {
		tr.delete(pos, pos + nodeSize);
	}

	// Update doc reference after deletion
	doc = tr.doc;

	// Re-find last paragraph after deletion
	lastPara = null;
	lastParaPos = 0;
	doc.descendants((node, pos) => {
		if (node.type.name === 'paragraph') {
			lastPara = node;
			lastParaPos = pos;
		}
	});

	// Step 4: Insert new words (only those after match point)
	const insertPos = lastParaPos + 1 + (lastPara?.content.size || 0);
	let currentPos = insertPos;

	// Calculate timing info
	const totalDuration = (endTime || 0) - (startTime || 0);
	const timePerChar = filteredText.length > 0 ? totalDuration / filteredText.length : 0;

	// Calculate character position up to match point
	let charPosition = 0;
	for (let i = 0; i < matchLength; i++) {
		charPosition += incomingWords[i].length + 1; // +1 for space
	}

	// Track if we need to add space before next word
	// Need space if there are existing words remaining in the document
	let needsSpace = lastPara.content.size > 0;

	// Only insert words after the match point
	console.log('[STREAMING] Will insert', incomingWords.length - matchLength, 'new words (after match point)');

	for (let i = matchLength; i < incomingWords.length; i++) {
		const word = incomingWords[i];

		// Add space before word if needed
		if (needsSpace) {
			const spaceNode = schema.text(' ');
			tr.insert(currentPos, spaceNode);
			currentPos += 1;
		}
		needsSpace = true;

		// Calculate word timing
		const wordStartTime = (startTime || 0) + charPosition * timePerChar;
		const wordEndTime = wordStartTime + word.length * timePerChar;

		// Generate new ID for this word
		const wordId = uuidv4();

		// Create word mark (all words start as non-final, non-approved)
		const wordMark = schema.marks.word.create({
			id: wordId,
			start: wordStartTime,
			end: wordEndTime,
			approved: false,
			final: false
		});

		// Add pending mark for non-approved words
		const pendingMark = schema.marks.pending.create();

		// Create text node with marks
		const textNode = schema.text(word, [wordMark, pendingMark]);
		tr.insert(currentPos, textNode);
		currentPos += word.length;

		console.log('[STREAMING] Inserted word:', word);

		charPosition += word.length + 1; // +1 for space
	}

	// Mark transaction to not add to history
	tr.setMeta('addToHistory', false);

	// Only mark as streaming if this is NOT final text
	if (!isFinal) {
		tr.setMeta('streamingText', true);
	}

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
					buffer: [],
					pendingText: '',
					currentTime: 0,
					previousIncomingText: '',
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
				// DON'T reset previousIncomingText here - it will be handled by the ternary in insertStreamingText()
				if (tr.getMeta('clearNewParagraphFlag')) {
					newValue = {
						...newValue,
						createNewParagraphOnNextText: false
					};
				}

				// Handle streaming text meta
				const streamingEvent = tr.getMeta('insertStreamingText') as
					| StreamingTextEvent
					| undefined;

				if (streamingEvent) {
					const { text, isFinal } = streamingEvent;

					// Update previousIncomingText with incoming text
					// This is used for final-word detection on next update
					newValue = {
						...newValue,
						buffer: isFinal ? [] : newValue.buffer,
						pendingText: isFinal ? '' : text,
						currentTime: streamingEvent.end || newValue.currentTime,
						previousIncomingText: text // Always update to incoming text
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
					// CRITICAL: Use oldState for deduplication, NOT newState
					// newState already has committedText updated to incoming text (from apply())
					// which would make all words appear as duplicates
					insertStreamingText(
						tr,
						oldState,  // Use OLD state to get previous committedText
						streamingEvent.text,
						streamingEvent.start,
						streamingEvent.end,
						streamingEvent.isFinal
					);
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
