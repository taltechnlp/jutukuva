/**
 * Subtitle Segmentation Plugin
 *
 * Monitors text and emits subtitle segments based on:
 * - Word count threshold (5+ words)
 * - Sentence-ending punctuation (. ! ?)
 * - Recording ended signal
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import type { Word, SubtitleSegment } from '../utils/types';
import { wordsToSegment } from '../utils/srtExport';

export interface SubtitleSegmentationState {
	segments: SubtitleSegment[];
	lastEmittedWordCount: number;
	emittedWordIds: Set<string>; // Track which word IDs have been emitted to avoid duplicates
}

export const subtitleSegmentationKey = new PluginKey<SubtitleSegmentationState>(
	'subtitleSegmentation'
);

/**
 * Extract words from a paragraph node
 */
function extractWordsFromParagraph(para: Node): Word[] {
	const words: Word[] = [];

	para.descendants((node) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark) {
				words.push({
					id: wordMark.attrs.id,
					text: node.text || '',
					start: wordMark.attrs.start,
					end: wordMark.attrs.end
				});
			}
		}
	});

	return words;
}

/**
 * Get all words from the document that haven't been emitted yet
 */
function getUnemittedWords(doc: Node, emittedWordIds: Set<string>): Word[] {
	const allWords: Word[] = [];

	doc.descendants((node) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark) => mark.type.name === 'word');
			if (wordMark && !emittedWordIds.has(wordMark.attrs.id)) {
				allWords.push({
					id: wordMark.attrs.id,
					text: node.text || '',
					start: wordMark.attrs.start,
					end: wordMark.attrs.end
				});
			}
		}
	});

	return allWords;
}

/**
 * Check if we should emit a segment based on current words
 */
function shouldEmitSegment(words: Word[]): boolean {
	if (words.length === 0) return false;

	// Check word count threshold (5+ words)
	if (words.length >= 5) return true;

	// Check character count threshold (30+ chars)
	const charCount = words.reduce((sum, w) => sum + w.text.length, 0);
	if (charCount >= 30) return true;

	// Check for sentence-ending punctuation on the last word
	const lastWord = words[words.length - 1];
	if (/[.!?]$/.test(lastWord.text.trim())) return true;

	return false;
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
					lastEmittedWordCount: 0,
					emittedWordIds: new Set()
				};
			},

			apply(tr, value, oldState, newState): SubtitleSegmentationState {
				let { segments, lastEmittedWordCount, emittedWordIds } = value;

				// Check if a segment was completed in appendTransaction
				const segmentCompleteMeta = tr.getMeta('segmentComplete');
				if (segmentCompleteMeta && onSegmentComplete) {
					onSegmentComplete(segmentCompleteMeta);
					segments = [...segments, segmentCompleteMeta];

					// Track emitted word IDs
					const newEmittedWordIds = new Set(emittedWordIds);
					segmentCompleteMeta.words.forEach((word: Word) => {
						newEmittedWordIds.add(word.id);
					});
					emittedWordIds = newEmittedWordIds;

					lastEmittedWordCount += segmentCompleteMeta.words.length;
				}

				return {
					segments,
					lastEmittedWordCount,
					emittedWordIds
				};
			}
		},

		// Monitor for segment emission triggers
		appendTransaction(transactions, oldState, newState) {
			// Prevent infinite loops - don't process transactions created by this plugin
			if (transactions.some((t) => t.getMeta('subtitleSegmentation'))) {
				return null;
			}

			const pluginState = subtitleSegmentationKey.getState(newState);
			if (!pluginState) return null;

			// Check if recording ended - emit all remaining words
			const recordingEndedSignal = transactions.some((t) => t.getMeta('recordingEnded'));
			if (recordingEndedSignal) {
				const unemittedWords = getUnemittedWords(newState.doc, pluginState.emittedWordIds);

				if (unemittedWords.length > 0) {
					const tr = newState.tr;
					const segmentIndex = pluginState.segments.length + 1;
					const segment = wordsToSegment(unemittedWords, segmentIndex);
					tr.setMeta('segmentComplete', segment);
					tr.setMeta('subtitleSegmentation', true);
					return tr;
				}
				return null;
			}

			// Check if document changed (new words added)
			const docChanged = transactions.some((t) => t.docChanged);
			if (!docChanged) return null;

			// Get unemitted words and check if we should emit
			const unemittedWords = getUnemittedWords(newState.doc, pluginState.emittedWordIds);

			if (shouldEmitSegment(unemittedWords)) {
				const tr = newState.tr;
				const segmentIndex = pluginState.segments.length + 1;
				const segment = wordsToSegment(unemittedWords, segmentIndex);
				tr.setMeta('segmentComplete', segment);
				tr.setMeta('subtitleSegmentation', true);
				return tr;
			}

			return null;
		}
	});
}
