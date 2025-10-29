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
	committedText: string; // Plain text that's been inserted (for deduplication)
	createNewParagraphOnNextText: boolean; // Set when VAD detects speech end
}

export const streamingTextKey = new PluginKey<StreamingTextState>('streamingText');

/**
 * Insert streaming text as pending words
 * For streaming models: REPLACES pending content (full hypothesis)
 */
function insertStreamingText(
	tr: Transaction,
	state: EditorState,
	text: string,
	startTime?: number,
	endTime?: number,
	isFinal?: boolean
): Transaction {
	console.log('[STREAMING-PLUGIN] insertStreamingText called:', {
		text: text.substring(0, 50),
		startTime,
		endTime,
		isFinal,
		docSize: tr.doc.content.size
	});

	const schema = state.schema;
	let doc = tr.doc;

	// Find the last paragraph by traversing from the end
	let lastPara: any = null;
	let lastParaPos = 0;

	// Traverse all children to find the last paragraph
	doc.descendants((node, pos) => {
		if (node.type.name === 'paragraph') {
			lastPara = node;
			lastParaPos = pos;
		}
	});

	console.log('[STREAMING-PLUGIN] Found paragraph:', { lastParaPos, paraSize: lastPara?.content.size });

	// Check if we should create a new paragraph (after VAD speech end)
	const pluginState = streamingTextKey.getState(state);
	const shouldCreateNewParagraph = pluginState?.createNewParagraphOnNextText;

	console.log('[STREAMING-PLUGIN] shouldCreateNewParagraph:', shouldCreateNewParagraph);

	if (shouldCreateNewParagraph && lastPara && lastPara.content.size > 0) {
		console.log('[STREAMING-PLUGIN] Creating new paragraph after speech pause');
		const newPara = schema.nodes.paragraph.create();
		const insertPos = lastParaPos + lastPara.nodeSize;
		tr.insert(insertPos, newPara);

		// Update doc reference to the modified document
		doc = tr.doc;

		// Re-find the new paragraph in the updated document
		let newLastParaPos = 0;
		let newLastPara: any = null;
		doc.descendants((node, pos) => {
			if (node.type.name === 'paragraph') {
				newLastPara = node;
				newLastParaPos = pos;
			}
		});

		lastParaPos = newLastParaPos;
		lastPara = newLastPara;

		console.log('[STREAMING-PLUGIN] New paragraph created at pos:', lastParaPos, 'size:', lastPara?.content.size);

		// Clear the flag by setting meta
		tr.setMeta('clearNewParagraphFlag', true);
	}

	// Extract committedText AFTER potentially creating new paragraph:
	// - ALL approved words from entire document
	// - ALL pending words from previous paragraphs (not including last paragraph)
	// This allows streaming replacement in the last paragraph while preventing
	// duplication from previous paragraphs after speech pauses
	let committedText = '';
	doc.descendants((node, pos) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark && node.text && node.text.trim().length > 0) {
				// Include if approved, OR if pending but not in last paragraph
				const inLastParagraph = lastPara && pos >= lastParaPos && pos < lastParaPos + lastPara.nodeSize;
				if (wordMark.attrs.approved || !inLastParagraph) {
					committedText += (committedText ? ' ' : '') + node.text.trim();
				}
			}
		}
	});
	console.log('[STREAMING-PLUGIN] Committed text:', committedText.substring(0, 50));

	// If no paragraph found, create one
	if (!lastPara) {
		console.log('[STREAMING] No paragraph found, creating one');
		const newPara = schema.nodes.paragraph.create();
		tr.insert(1, newPara); // Insert after doc node opening
		lastParaPos = 1;
		lastPara = newPara;
	}

	// SIMPLE DEDUPLICATION: Compare incoming text with committed text (plain strings)
	// This is what the ASR actually sends - no need for complex document scanning

	// Split both texts into words for comparison
	const committedWords = committedText.trim().split(/\s+/).filter(w => w.length > 0);
	const incomingWords = text.trim().split(/\s+/).filter(w => w.length > 0);

	console.log('[STREAMING-PLUGIN] Committed words:', committedWords.length, ':', committedWords.slice(0, 10).join(' '));
	console.log('[STREAMING-PLUGIN] Incoming words:', incomingWords.length, ':', incomingWords.slice(0, 10).join(' '));

	// Find how many words at the start match (common prefix)
	let commonPrefixLength = 0;
	for (let i = 0; i < Math.min(committedWords.length, incomingWords.length); i++) {
		if (committedWords[i] === incomingWords[i]) {
			commonPrefixLength++;
		} else {
			break;
		}
	}

	console.log('[STREAMING-PLUGIN] Common prefix:', commonPrefixLength, 'words');
	console.log('[STREAMING-PLUGIN] Will insert:', incomingWords.length - commonPrefixLength, 'new words');

	// Extract pending words from last paragraph (for ID reuse)
	// Use ARRAY to preserve order and handle duplicate words correctly
	const paraStart = lastParaPos + 1;
	const paraEnd = lastParaPos + lastPara.nodeSize - 1;
	const pendingWords: Array<{text: string, id: string}> = [];

	doc.nodesBetween(paraStart, paraEnd, (node, pos) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark && !wordMark.attrs.approved && node.text && node.text.trim().length > 0) {
				pendingWords.push({
					text: node.text.trim(),
					id: wordMark.attrs.id
				});
			}
		}
	});

	console.log('[STREAMING-PLUGIN] Found', pendingWords.length, 'pending words in last paragraph:', pendingWords.map(w => w.text).slice(0, 10).join(' '));

	// Find range of pending content to delete
	let firstPendingPos: number | null = null;
	let lastPendingPos: number | null = null;

	doc.nodesBetween(paraStart, paraEnd, (node, pos) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark && !wordMark.attrs.approved) {
				if (firstPendingPos === null) {
					firstPendingPos = pos;
				}
				lastPendingPos = pos + node.nodeSize;
			}
		}
	});

	// Delete all pending content in one operation
	if (firstPendingPos !== null && lastPendingPos !== null) {
		tr.delete(firstPendingPos, lastPendingPos);

		// Re-find the last paragraph after deletion
		lastPara = null;
		lastParaPos = 0;
		tr.doc.descendants((node, pos) => {
			if (node.type.name === 'paragraph') {
				lastPara = node;
				lastParaPos = pos;
			}
		});
	}

	// Insert position is at the end of the last paragraph
	const insertPos = lastParaPos + 1 + (lastPara?.content.size || 0);

	console.log('[STREAMING-PLUGIN] Insert position:', insertPos);

	// Split text into words (preserve spacing for accurate timing)
	const textParts = text.split(/(\s+)/);

	console.log('[STREAMING-PLUGIN] Split into', textParts.length, 'parts (words + spaces)');

	// Calculate timing info
	let currentPos = insertPos;
	let wordStartTime = startTime || 0;
	const totalDuration = (endTime || 0) - (startTime || 0);
	const timePerChar = text.length > 0 ? totalDuration / text.length : 0;

	let insertedWords = 0;
	let insertedSpaces = 0;
	let incomingWordIndex = 0; // Track position in incoming word list

	// Track cumulative character position for timing calculations
	let charPosition = 0;

	for (const part of textParts) {
		if (part.length === 0) continue;

		const isWord = part.trim().length > 0;

		if (isWord) {
			// Check if this word is part of the common prefix (already committed)
			if (incomingWordIndex < commonPrefixLength) {
				// Skip this word - it's already in committedText
				console.log('[STREAMING-PLUGIN] Skipping word', incomingWordIndex, '(already committed):', part);
				incomingWordIndex++;
				charPosition += part.length;
				continue;
			}

			// This is a NEW word that needs to be inserted
			// Calculate word timing based on character position
			const wordStartTimeCalc = (startTime || 0) + charPosition * timePerChar;
			const wordEndTimeCalc = wordStartTimeCalc + part.length * timePerChar;

			// Try to reuse ID from pending words (position-based lookup)
			// Map incoming word position (after common prefix) to pending word array index
			const pendingWordIndex = incomingWordIndex - commonPrefixLength;
			const pendingWord = pendingWords[pendingWordIndex];
			const wordId = pendingWord?.id || uuidv4();

			if (pendingWord) {
				console.log('[STREAMING-PLUGIN] Reusing ID from position', pendingWordIndex, 'for word "' + part.trim() + '":', wordId);
			} else {
				console.log('[STREAMING-PLUGIN] Creating new ID for word "' + part.trim() + '" at position', pendingWordIndex, ':', wordId);
			}

			// Create word mark
			const wordMark = schema.marks.word.create({
				id: wordId,
				start: wordStartTimeCalc,
				end: wordEndTimeCalc,
				approved: false
			});

			// Create pending mark for visual styling
			const pendingMark = schema.marks.pending.create();

			// Create text node with marks
			const textNode = schema.text(part, [wordMark, pendingMark]);

			// Insert the text node
			tr.insert(currentPos, textNode);
			currentPos += part.length;
			insertedWords++;
			incomingWordIndex++;
		} else {
			// Only insert space if we're past the common prefix
			if (incomingWordIndex >= commonPrefixLength) {
				// Insert whitespace without marks
				const textNode = schema.text(part);
				tr.insert(currentPos, textNode);
				currentPos += part.length;
				insertedSpaces++;
			}
		}

		charPosition += part.length;
	}

	console.log('[STREAMING-PLUGIN] Inserted', insertedWords, 'words and', insertedSpaces, 'spaces');
	console.log('[STREAMING-PLUGIN] Final doc size:', tr.doc.content.size);

	// Mark transaction to not add to history
	tr.setMeta('addToHistory', false);

	// Only mark as streaming if this is NOT final text
	// This allows auto-confirm to start scheduling timers when final text arrives
	if (!isFinal) {
		tr.setMeta('streamingText', true);
		console.log('[STREAMING-PLUGIN] Marked as streaming (non-final)');
	} else {
		console.log('[STREAMING-PLUGIN] NOT marked as streaming (final text)');
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
					committedText: '',
					createNewParagraphOnNextText: false
				};
			},

			apply(tr, value): StreamingTextState {
				// Handle VAD speech end - set flag to create new paragraph
				if (tr.getMeta('vadSpeechEnd')) {
					console.log('[STREAMING-PLUGIN] VAD speech end - will create new paragraph on next text');
					return {
						...value,
						createNewParagraphOnNextText: true
					};
				}

				// Clear the flag after it's been used
				if (tr.getMeta('clearNewParagraphFlag')) {
					return {
						...value,
						createNewParagraphOnNextText: false
					};
				}

				// Handle streaming text meta
				const streamingEvent = tr.getMeta('insertStreamingText') as
					| StreamingTextEvent
					| undefined;

				if (streamingEvent) {
					const { text, isFinal } = streamingEvent;

					if (isFinal) {
						// Final text, clear buffer
						// committedText is derived from document, no need to reset
						return {
							...value,
							buffer: [],
							pendingText: '',
							currentTime: streamingEvent.end || value.currentTime,
							committedText: '' // Clear for safety
						};
					} else {
						// Partial text, add to buffer
						return {
							...value,
							pendingText: text,
							currentTime: streamingEvent.end || value.currentTime
						};
					}
				}

				return value;
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
					insertStreamingText(
						tr,
						newState,
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
