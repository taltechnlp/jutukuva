/**
 * Subtitle Segmentation Plugin
 *
 * Monitors text and creates paragraph breaks based on subtitle rules
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { shouldBreakAtWord } from '../utils/subtitleRules';
import type { Word, SubtitleSegment } from '../utils/types';
import { wordsToSegment } from '../utils/srtExport';

export interface SubtitleSegmentationState {
	segments: SubtitleSegment[];
	currentSegmentLength: number;
	lastCheckPosition: number;
	recordingEnded: boolean;
	lastEmittedWordCount: number;
	emittedWordIds: Set<string>; // Track which word IDs have been emitted to avoid duplicates
}

export const subtitleSegmentationKey = new PluginKey<SubtitleSegmentationState>(
	'subtitleSegmentation'
);

/**
 * Extract words from a paragraph node
 */
function extractWordsFromParagraph(para: Node, startPos: number): Word[] {
	const words: Word[] = [];

	para.descendants((node, pos) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark) {
				words.push({
					id: wordMark.attrs.id,
					text: node.text || '',
					start: wordMark.attrs.start,
					end: wordMark.attrs.end,
					approved: wordMark.attrs.approved,
					final: wordMark.attrs.final
				});
			}
		}
	});

	return words;
}

/**
 * Calculate text length of current segment
 */
function calculateSegmentLength(doc: Node, paraIndex: number): number {
	let length = 0;
	const para = doc.child(paraIndex);

	para.descendants((node) => {
		if (node.isText) {
			length += (node.text || '').length;
		}
	});

	return length;
}

/**
 * Check if we should split the paragraph
 */
function shouldSplitParagraph(
	doc: Node,
	paraIndex: number
): { shouldSplit: boolean; splitPos?: number } {
	const para = doc.child(paraIndex);
	const words = extractWordsFromParagraph(para, 0);

	if (words.length === 0) {
		return { shouldSplit: false };
	}

	// Check each word to see if we should break
	// Calculate accumulated length up to each word
	let accumulatedLength = 0;
	for (let i = 0; i < words.length; i++) {
		accumulatedLength += words[i].text.length;

		if (shouldBreakAtWord(words, i, accumulatedLength)) {
			// Find the position after this word
			let currentPos = 0;
			let splitPos: number | undefined;

			para.descendants((node, pos) => {
				if (splitPos !== undefined) return false;

				if (node.isText) {
					const wordMark = node.marks.find((mark) => mark.type.name === 'word');
					if (wordMark && wordMark.attrs.id === words[i].id) {
						splitPos = pos + node.nodeSize;
						return false;
					}
				}
			});

			if (splitPos !== undefined) {
				return { shouldSplit: true, splitPos };
			}
		}
	}

	return { shouldSplit: false };
}

/**
 * Split paragraph at position
 */
function splitParagraphAt(tr: Transaction, paraPos: number, splitPos: number): Transaction {
	const $pos = tr.doc.resolve(paraPos + splitPos);

	// Create a new paragraph
	const newPara = tr.doc.type.schema.nodes.paragraph.create();

	// Split the paragraph
	tr.split($pos.pos);

	return tr;
}

/**
 * Create subtitle segmentation plugin
 */
export function subtitleSegmentationPlugin(onSegmentComplete?: (segment: SubtitleSegment) => void) {
	return new Plugin<SubtitleSegmentationState>({
		key: subtitleSegmentationKey,

		state: {
			init(): SubtitleSegmentationState {
				return {
					segments: [],
					currentSegmentLength: 0,
					lastCheckPosition: 0,
					recordingEnded: false,
					lastEmittedWordCount: 0,
					emittedWordIds: new Set()
				};
			},

			apply(tr, value, oldState, newState): SubtitleSegmentationState {
				let { segments, currentSegmentLength, lastCheckPosition, recordingEnded, lastEmittedWordCount, emittedWordIds } = value;

				// Track if recording ended
				if (tr.getMeta('recordingEnded')) {
					recordingEnded = true;
				}

				// Update segment list on document changes
				if (tr.docChanged) {
					// Recalculate current segment length
					const lastParaIndex = newState.doc.childCount - 1;
					currentSegmentLength = calculateSegmentLength(newState.doc, lastParaIndex);
				}

				// Check if we need to update segments (do this outside tr.docChanged!)
				// The transaction from appendTransaction has metadata but doesn't change the doc
				const segmentCompleteMeta = tr.getMeta('segmentComplete');
				if (segmentCompleteMeta && onSegmentComplete) {
					onSegmentComplete(segmentCompleteMeta);
					segments = [...segments, segmentCompleteMeta];

					// Count how many words were in this segment
					lastEmittedWordCount += segmentCompleteMeta.words.length;

					// Track emitted word IDs
					const newEmittedWordIds = new Set(emittedWordIds);
					segmentCompleteMeta.words.forEach((word: Word) => {
						newEmittedWordIds.add(word.id);
					});
					emittedWordIds = newEmittedWordIds;
				}

				return {
					segments,
					currentSegmentLength,
					lastCheckPosition,
					recordingEnded,
					lastEmittedWordCount,
					emittedWordIds
				};
			}
		},

		// Monitor for automatic paragraph breaks
		appendTransaction(transactions, oldState, newState) {
			// Prevent infinite loops - don't process transactions created by this plugin
			if (transactions.some((t) => t.getMeta('subtitleSegmentation'))) {
				return null;
			}

			const tr = newState.tr;
			let modified = false;

			// Check if a word was just approved - potentially emit segment in real-time
			const wordApproved = transactions.some((t) => t.getMeta('approveWord') !== undefined);
			if (wordApproved) {
				const pluginState = subtitleSegmentationKey.getState(newState);
				const lastParaIndex = newState.doc.childCount - 1;

				if (pluginState && lastParaIndex >= 0) {
					const lastPara = newState.doc.child(lastParaIndex);
					const allWords = extractWordsFromParagraph(lastPara, 0);

					// Only consider approved words that haven't been emitted yet
					const unemittedApprovedWords = allWords.filter(
						(w) => w.approved && !pluginState.emittedWordIds.has(w.id)
					);

					// Calculate total character length of unemitted approved words
					const approvedTextLength = unemittedApprovedWords.reduce((sum, w) => sum + w.text.length, 0);
					const approvedWordCount = unemittedApprovedWords.length;

					// Emit segment more frequently since we're not splitting paragraphs
					// Criteria: 30+ chars OR 5+ words OR sentence ending OR any approved words if recording ended
					const shouldEmit =
						approvedTextLength >= 30 ||
						approvedWordCount >= 5 ||
						(unemittedApprovedWords.length > 0 && /[.!?]$/.test(unemittedApprovedWords[unemittedApprovedWords.length - 1].text.trim()));

					if (shouldEmit) {
						const segmentIndex = pluginState.segments.length + 1;
						const segment = wordsToSegment(unemittedApprovedWords, segmentIndex);
						tr.setMeta('segmentComplete', segment);
						modified = true;

						// NOTE: Paragraph splitting removed - no longer create new paragraphs
						// when words are confirmed. All text stays in one paragraph to avoid
						// jumping and maintain simpler document structure.
					}
				}

				if (modified) {
					tr.setMeta('subtitleSegmentation', true);
					return tr;
				}
			}

			// Check if all words were just approved - emit final segment
			const allWordsApproved = transactions.some((t) => t.getMeta('allWordsApproved'));
			if (allWordsApproved) {
				const pluginState = subtitleSegmentationKey.getState(newState);
				const lastParaIndex = newState.doc.childCount - 1;

				if (pluginState && lastParaIndex >= 0) {
					// Get all approved words from the last paragraph that haven't been emitted
					const lastPara = newState.doc.child(lastParaIndex);
					const allWords = extractWordsFromParagraph(lastPara, 0);
					const unemittedApprovedWords = allWords.filter(
						(w) => w.approved && !pluginState.emittedWordIds.has(w.id)
					);

					if (unemittedApprovedWords.length > 0) {
						const segmentIndex = pluginState.segments.length + 1;
						const segment = wordsToSegment(unemittedApprovedWords, segmentIndex);
						tr.setMeta('segmentComplete', segment);
						modified = true;
					}
				}

				if (modified) {
					tr.setMeta('subtitleSegmentation', true);
					return tr;
				}
				return null;
			}

			// NOTE: Automatic paragraph splitting based on subtitle rules removed
			// No longer split paragraphs automatically. All text stays in one paragraph.

			// Check if recording ended signal was just sent (not on every transaction)
			const recordingEndedSignal = transactions.some((t) => t.getMeta('recordingEnded'));
			if (recordingEndedSignal) {
				const pluginState = subtitleSegmentationKey.getState(newState);
				const lastParaIndex = newState.doc.childCount - 1;

				if (pluginState && lastParaIndex >= 0) {
					// Get all approved words from the last paragraph that haven't been emitted
					const lastPara = newState.doc.child(lastParaIndex);
					const allWords = extractWordsFromParagraph(lastPara, 0);
					const unemittedApprovedWords = allWords.filter(
						(w) => w.approved && !pluginState.emittedWordIds.has(w.id)
					);

					if (unemittedApprovedWords.length > 0) {
						const segmentIndex = pluginState.segments.length + 1;
						const segment = wordsToSegment(unemittedApprovedWords, segmentIndex);
						tr.setMeta('segmentComplete', segment);
						modified = true;
					}
				}
			}

			// Mark transaction with metadata to prevent infinite loops
			if (modified) {
				tr.setMeta('subtitleSegmentation', true);
				return tr;
			}
			return null;
		},

		// NOTE: view update removed to prevent infinite loops
		// Segment emission now happens only in appendTransaction
	});
}
