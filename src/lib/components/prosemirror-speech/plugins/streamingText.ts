/**
 * Streaming Text Plugin
 *
 * Inserts streaming ASR text at document end without disrupting user's cursor
 *
 * Key behaviors:
 * - ASR sends full transcript each time; we extract only the delta (new words)
 * - Matches incoming ASR words against existing document words
 * - Only appends truly new words that aren't already in the document
 * - Can update the last ASR word (grow longer or add punctuation)
 * - Never deletes user content
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import { v4 as uuidv4 } from 'uuid';
import type { StreamingTextEvent } from '../utils/types';

export interface StreamingTextState {
	previousIncomingText: string; // Previous ASR result for tracking
	createNewParagraphOnNextText: boolean; // Set when VAD detects speech end
}

export const streamingTextKey = new PluginKey<StreamingTextState>('streamingText');

/**
 * Normalize word for comparison (strip punctuation, lowercase)
 */
function normalizeWord(word: string): string {
	return word.replace(/[.,!?;:]+$/, '').toLowerCase();
}

/**
 * Check if the new word is an update of the old word
 * Returns true if newWord is the oldWord with more characters or punctuation added
 */
function isWordUpdate(oldWord: string, newWord: string): boolean {
	if (!oldWord || !newWord) return false;

	const oldNorm = normalizeWord(oldWord);
	const newNorm = normalizeWord(newWord);

	// New word should start with old word's base (for partial -> complete)
	// Or be the same base but with different punctuation
	return newNorm.startsWith(oldNorm) || oldNorm === newNorm;
}

/**
 * Insert streaming text with proper deduplication
 * Matches incoming ASR text against existing document content
 * Only appends new words, optionally updates the last word
 */
function insertStreamingText(
	tr: Transaction,
	state: EditorState,
	pluginState: StreamingTextState | undefined,
	text: string,
	startTime?: number,
	endTime?: number
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

	const paraStart = lastParaPos + 1;
	const paraEnd = lastParaPos + lastPara.nodeSize - 1;

	// Collect existing words from the paragraph
	interface ExistingWord {
		text: string;
		id: string;
		pos: number;
		nodeSize: number;
	}
	const existingWords: ExistingWord[] = [];

	if (paraStart < paraEnd) {
		doc.nodesBetween(paraStart, paraEnd, (node, pos) => {
			if (node.isText && node.marks.length > 0) {
				const wordMark = node.marks.find((mark: any) => mark.type.name === 'word');
				if (wordMark && node.text && node.text.trim().length > 0) {
					existingWords.push({
						text: node.text.trim(),
						id: wordMark.attrs.id,
						pos: pos,
						nodeSize: node.nodeSize
					});
				}
			}
		});
	}

	// Match incoming words against existing words from the start
	let matchLength = 0;
	for (let i = 0; i < Math.min(existingWords.length, incomingWords.length); i++) {
		const existingNorm = normalizeWord(existingWords[i].text);
		const incomingNorm = normalizeWord(incomingWords[i]);

		if (existingNorm === incomingNorm) {
			matchLength++;
		} else {
			// Check if this is a word update (e.g., "hel" -> "hello" or "hello" -> "hello,")
			if (i === existingWords.length - 1 && isWordUpdate(existingWords[i].text, incomingWords[i])) {
				// Last existing word is being updated - we'll handle this below
				matchLength++;
			}
			break;
		}
	}

	// Determine what to insert
	let wordsToAppend: string[] = [];
	let updateLastWord = false;
	let lastWordUpdate = '';

	if (matchLength === existingWords.length) {
		// All existing words matched
		if (incomingWords.length > existingWords.length) {
			// There are new words to append
			wordsToAppend = incomingWords.slice(existingWords.length);
		}
		// Check if we should update the last existing word
		if (existingWords.length > 0 && incomingWords.length >= existingWords.length) {
			const lastExisting = existingWords[existingWords.length - 1];
			const correspondingIncoming = incomingWords[existingWords.length - 1];
			if (lastExisting.text !== correspondingIncoming && isWordUpdate(lastExisting.text, correspondingIncoming)) {
				updateLastWord = true;
				lastWordUpdate = correspondingIncoming;
			}
		}
	} else if (matchLength > 0 && matchLength < existingWords.length) {
		// Partial match - user may have edited. Only add words beyond existing count
		if (incomingWords.length > existingWords.length) {
			wordsToAppend = incomingWords.slice(existingWords.length);
		}
		// Check for last word update
		if (existingWords.length > 0 && incomingWords.length >= existingWords.length) {
			const lastExisting = existingWords[existingWords.length - 1];
			const correspondingIncoming = incomingWords[existingWords.length - 1];
			if (lastExisting.text !== correspondingIncoming && isWordUpdate(lastExisting.text, correspondingIncoming)) {
				updateLastWord = true;
				lastWordUpdate = correspondingIncoming;
			}
		}
	} else if (matchLength === 0 && existingWords.length === 0) {
		// Empty paragraph - append all incoming words
		wordsToAppend = incomingWords;
	} else if (matchLength === 0 && existingWords.length > 0) {
		// No match at all but we have existing content - don't touch it
		// This shouldn't happen with stable ASR history, but handle gracefully
		if (incomingWords.length > existingWords.length) {
			wordsToAppend = incomingWords.slice(existingWords.length);
		}
	}

	// Update the last word if needed
	if (updateLastWord && existingWords.length > 0) {
		const lastExisting = existingWords[existingWords.length - 1];
		const from = lastExisting.pos;
		const to = from + lastExisting.nodeSize;

		// Get the existing mark to preserve its attributes
		const existingNode = doc.nodeAt(from);
		if (existingNode && existingNode.isText) {
			const existingMark = existingNode.marks.find((m: any) => m.type.name === 'word');
			if (existingMark) {
				const updatedMark = schema.marks.word.create({
					id: existingMark.attrs.id,
					start: existingMark.attrs.start,
					end: endTime || existingMark.attrs.end
				});
				const newTextNode = schema.text(lastWordUpdate, [updatedMark]);
				tr.replaceWith(from, to, newTextNode);

				// Update doc reference after modification
				doc = tr.doc;

				// Re-find last paragraph
				lastPara = null;
				lastParaPos = 0;
				doc.descendants((node, pos) => {
					if (node.type.name === 'paragraph') {
						lastPara = node;
						lastParaPos = pos;
					}
				});
			}
		}
	}

	// Append new words
	if (wordsToAppend.length > 0) {
		let insertPos = lastParaPos + 1 + (lastPara?.content.size || 0);
		let needsSpaceBefore = lastPara?.content.size > 0;

		// Calculate timing info for new words
		const totalDuration = (endTime || 0) - (startTime || 0);
		const totalChars = wordsToAppend.join(' ').length;
		const timePerChar = totalChars > 0 ? totalDuration / totalChars : 0;
		let charPosition = 0;

		for (let i = 0; i < wordsToAppend.length; i++) {
			const word = wordsToAppend[i];

			// Add space before word if needed
			if (needsSpaceBefore) {
				const spaceNode = schema.text(' ');
				tr.insert(insertPos, spaceNode);
				insertPos += 1;
			}
			needsSpaceBefore = true;

			// Calculate word timing
			const wordStartTime = (startTime || 0) + charPosition * timePerChar;
			const wordEndTime = wordStartTime + word.length * timePerChar;

			// Generate new ID for this word
			const wordId = uuidv4();

			// Create word mark
			const wordMark = schema.marks.word.create({
				id: wordId,
				start: wordStartTime,
				end: wordEndTime
			});

			// Create text node with mark
			const textNode = schema.text(word, [wordMark]);
			tr.insert(insertPos, textNode);
			insertPos += word.length;

			charPosition += word.length + 1; // +1 for space
		}
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
						createNewParagraphOnNextText: true,
						previousIncomingText: '' // Reset for new paragraph
					};
				}

				// Handle manual paragraph creation (Enter key)
				if (tr.getMeta('manualParagraphCreated')) {
					newValue = {
						...newValue,
						previousIncomingText: '' // Reset for new paragraph
					};
				}

				// Clear the flag after it's been used
				if (tr.getMeta('clearNewParagraphFlag')) {
					newValue = {
						...newValue,
						createNewParagraphOnNextText: false
					};
				}

				// Track incoming text for reference
				const streamingEvent = tr.getMeta('insertStreamingText') as StreamingTextEvent | undefined;
				if (streamingEvent) {
					newValue = {
						...newValue,
						previousIncomingText: streamingEvent.text
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

					insertStreamingText(
						tr,
						oldState,
						pluginState,
						streamingEvent.text,
						streamingEvent.start,
						streamingEvent.end
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
