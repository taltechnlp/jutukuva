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

	// Split both into word lists (use filtered text if we created a new paragraph)
	const previousWords = new Set(previousIncomingText.trim().split(/\s+/).filter(w => w.length > 0));
	const incomingWords = filteredText.trim().split(/\s+/).filter(w => w.length > 0);
	const incomingWordsSet = new Set(incomingWords);

	// Common words = words appearing in BOTH previous and current results
	// These words are stable and should be marked as final
	const commonWords = new Set<string>();
	for (const word of incomingWords) {
		if (previousWords.has(word)) {
			commonWords.add(word);
		}
	}

	console.log('[FINAL-WORD] Previous:', previousIncomingText);
	console.log('[FINAL-WORD] Incoming (filtered):', filteredText);
	console.log('[FINAL-WORD] Common words:', Array.from(commonWords));

	const paraStart = lastParaPos + 1;
	const paraEnd = lastParaPos + lastPara.nodeSize - 1;

	// Collect all words in the last paragraph
	const existingWords: Array<{
		text: string;
		id: string;
		pos: number;
		nodeSize: number;
		final: boolean;
		approved: boolean;
	}> = [];

	doc.nodesBetween(paraStart, paraEnd, (node, pos) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark && node.text && node.text.trim().length > 0) {
				existingWords.push({
					text: node.text.trim(),
					id: wordMark.attrs.id,
					pos: pos,
					nodeSize: node.nodeSize,
					final: wordMark.attrs.final,
					approved: wordMark.attrs.approved
				});
			}
		}
	});

	// Track words that became final (for auto-confirm notification)
	const wordsBecameFinal: string[] = [];

	// Step 1: Mark non-final words as final if they're in commonWords
	// NEVER touch approved or already-final words
	for (const word of existingWords) {
		if (!word.approved && !word.final && commonWords.has(word.text)) {
			// Update this word to final=true
			const node = doc.nodeAt(word.pos);
			if (node && node.isText) {
				const wordMark = node.marks.find((m) => m.type.name === 'word');
				if (wordMark) {
					// Create new word mark with final=true
					const newWordMark = schema.marks.word.create({
						...wordMark.attrs,
						final: true
					});

					// Replace marks on this text node
					const otherMarks = node.marks.filter((m) => m.type.name !== 'word');
					tr.removeMark(word.pos, word.pos + node.nodeSize, schema.marks.word);
					tr.addMark(word.pos, word.pos + node.nodeSize, newWordMark);

					// Restore other marks
					for (const mark of otherMarks) {
						tr.addMark(word.pos, word.pos + node.nodeSize, mark);
					}

					wordsBecameFinal.push(wordMark.attrs.id);
					console.log('[FINAL-WORD] Marked as final:', word.text);
				}
			}
		}
	}

	// Emit wordBecameFinal meta for auto-confirm to pick up
	if (wordsBecameFinal.length > 0) {
		tr.setMeta('wordsBecameFinal', wordsBecameFinal);
	}

	// Update doc reference after marking
	doc = tr.doc;

	// Re-collect existing words with updated state
	const updatedExistingWords: Array<{
		text: string;
		id: string;
		pos: number;
		nodeSize: number;
		final: boolean;
		approved: boolean;
	}> = [];

	doc.nodesBetween(paraStart, paraEnd, (node, pos) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark && node.text && node.text.trim().length > 0) {
				updatedExistingWords.push({
					text: node.text.trim(),
					id: wordMark.attrs.id,
					pos: pos,
					nodeSize: node.nodeSize,
					final: wordMark.attrs.final,
					approved: wordMark.attrs.approved
				});
			}
		}
	});

	// Step 2: Delete ALL non-final, non-approved words
	// NEVER delete final or approved words (immutable!)
	// Non-final words are unstable - ASR may correct them, so delete and re-insert
	const wordsToDelete: Array<{ pos: number; nodeSize: number }> = [];

	for (const word of updatedExistingWords) {
		if (!word.approved && !word.final) {
			wordsToDelete.push({ pos: word.pos, nodeSize: word.nodeSize });
			console.log('[FINAL-WORD] Deleting non-final word:', word.text);
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

	// Step 3: Collect final/approved words to avoid duplicating them
	const finalAndApprovedWords = new Set<string>();
	doc.nodesBetween(lastParaPos + 1, lastParaPos + lastPara.nodeSize - 1, (node) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark && (wordMark.attrs.final || wordMark.attrs.approved) && node.text && node.text.trim().length > 0) {
				finalAndApprovedWords.add(node.text.trim());
			}
		}
	});

	console.log('[FINAL-WORD] Final/approved words in paragraph:', finalAndApprovedWords.size);
	console.log('[FINAL-WORD] Will insert', incomingWords.filter(w => !finalAndApprovedWords.has(w)).length, 'new words');

	// Step 4: Insert new words
	const insertPos = lastParaPos + 1 + (lastPara?.content.size || 0);
	let currentPos = insertPos;

	// Calculate timing info
	const totalDuration = (endTime || 0) - (startTime || 0);
	const timePerChar = filteredText.length > 0 ? totalDuration / filteredText.length : 0;
	let charPosition = 0;

	// Track if we need to add space before next word
	let needsSpace = finalAndApprovedWords.size > 0;

	for (let i = 0; i < incomingWords.length; i++) {
		const word = incomingWords[i];

		// Skip words that are already final or approved (immutable!)
		if (finalAndApprovedWords.has(word)) {
			charPosition += word.length + 1; // +1 for space
			continue;
		}

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

		// Determine if this word should be final
		const shouldBeFinal = commonWords.has(word);

		// Create word mark
		const wordMark = schema.marks.word.create({
			id: wordId,
			start: wordStartTime,
			end: wordEndTime,
			approved: false,
			final: shouldBeFinal
		});

		// Add pending mark for non-approved words
		const pendingMark = schema.marks.pending.create();

		// Create text node with marks
		const textNode = schema.text(word, [wordMark, pendingMark]);
		tr.insert(currentPos, textNode);
		currentPos += word.length;

		console.log('[FINAL-WORD] Inserted word:', word, 'final:', shouldBeFinal);

		// If word is final on insertion, notify auto-confirm
		if (shouldBeFinal) {
			const existingList = tr.getMeta('wordsBecameFinal') || [];
			tr.setMeta('wordsBecameFinal', [...existingList, wordId]);
		}

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
export function streamingTextPlugin() {
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
