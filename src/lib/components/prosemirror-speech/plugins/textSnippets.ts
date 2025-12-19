/**
 * Text Snippets Plugin
 *
 * Provides autocomplete functionality with ghost text preview
 * - Matches text snippets from custom dictionaries
 * - Shows inline ghost text preview
 * - Space to apply, Esc to cancel
 * - Case-insensitive matching with dictionary case output
 */

import { Plugin, PluginKey, type Transaction, type EditorState, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

export interface TextSnippetEntry {
	trigger: string;
	replacement: string;
	dictionary_id?: string;
	dictionary_name?: string;
}

interface TextSnippetMatch {
	from: number;
	to: number;
	trigger: string;
	replacement: string;
}

interface TextSnippetState {
	entries: TextSnippetEntry[];
	activeMatch: TextSnippetMatch | null;
	decorations: DecorationSet;
}

export const textSnippetKey = new PluginKey<TextSnippetState>('textSnippet');

/**
 * Find word boundary before position
 */
function findWordBoundaryBefore(text: string, pos: number): number {
	// Move backwards to find whitespace or start
	while (pos > 0 && !/\s/.test(text[pos - 1])) {
		pos--;
	}
	return pos;
}

/**
 * Extract word at cursor position
 */
function getWordAtCursor(state: EditorState): { word: string; from: number; to: number } | null {
	const { $from } = state.selection;

	// Get text from the start of the current text node to cursor
	const textStart = $from.start();
	const cursorPos = $from.pos;

	// Get the text before cursor
	const text = state.doc.textBetween(textStart, cursorPos, '\n', '\ufffc');

	// Find the start of the current word (last word boundary)
	const wordStart = findWordBoundaryBefore(text, text.length);
	const word = text.slice(wordStart);

	// Check if we're at the end of a word (cursor should not have text immediately after)
	const textAfter = state.doc.textBetween(cursorPos, Math.min(cursorPos + 1, state.doc.content.size), '\n', '\ufffc');
	if (textAfter && !/\s/.test(textAfter[0])) {
		// Cursor is in the middle of a word, not at the end
		return null;
	}

	if (!word || /\s/.test(word)) {
		return null;
	}

	return {
		word,
		from: textStart + wordStart,
		to: cursorPos
	};
}

/**
 * Find matching entry for a word (case-insensitive)
 */
function findMatch(word: string, entries: TextSnippetEntry[]): TextSnippetEntry | null {
	const lowerWord = word.toLowerCase();
	// Entries are ordered by length DESC, so we get the longest match first
	return entries.find(entry => entry.trigger.toLowerCase() === lowerWord) || null;
}

/**
 * Create ghost text decoration with strikethrough on trigger and full replacement preview
 */
function createGhostTextDecoration(match: TextSnippetMatch, doc: any): DecorationSet {
	const decorations: Decoration[] = [];

	// Add strikethrough decoration to the trigger text
	decorations.push(
		Decoration.inline(match.from, match.to, {
			class: 'snippet-trigger-strikethrough'
		})
	);

	// Add widget showing the full replacement as ghost text
	const widget = Decoration.widget(
		match.to,
		() => {
			const span = document.createElement('span');
			span.className = 'snippet-ghost-text';
			span.textContent = match.replacement;
			return span;
		},
		{
			side: 1, // Place after the cursor
			key: 'ghost-text'
		}
	);
	decorations.push(widget);

	return DecorationSet.create(doc, decorations);
}

/**
 * Create the text snippets plugin
 */
export function textSnippetsPlugin(options: { entries: TextSnippetEntry[] }): Plugin<TextSnippetState> {
	return new Plugin<TextSnippetState>({
		key: textSnippetKey,

		state: {
			init(): TextSnippetState {
				return {
					entries: options.entries,
					activeMatch: null,
					decorations: DecorationSet.empty
				};
			},

			apply(tr: Transaction, state: TextSnippetState, oldState: EditorState, newState: EditorState): TextSnippetState {
				// Allow external updates to entries
				const newEntries = tr.getMeta(textSnippetKey)?.entries;
				if (newEntries) {
					return {
						...state,
						entries: newEntries,
						activeMatch: null,
						decorations: DecorationSet.empty
					};
				}

				// If explicitly cancelled
				if (tr.getMeta(textSnippetKey)?.cancel) {
					return {
						...state,
						activeMatch: null,
						decorations: DecorationSet.empty
					};
				}

				// Map decorations through changes
				let { activeMatch, decorations } = state;

				// If document changed, re-evaluate match
				if (tr.docChanged) {
					// Skip if this is ASR-inserted text (not user typing)
					if (tr.getMeta('insertStreamingText')) {
						return {
							...state,
							activeMatch: null,
							decorations: DecorationSet.empty
						};
					}

					const wordInfo = getWordAtCursor(newState);

					if (wordInfo && wordInfo.word.length > 0) {
						const match = findMatch(wordInfo.word, state.entries);

						if (match && match.replacement !== wordInfo.word) {
							// We have a match!
							activeMatch = {
								from: wordInfo.from,
								to: wordInfo.to,
								trigger: wordInfo.word,
								replacement: match.replacement
							};
							decorations = createGhostTextDecoration(activeMatch, tr.doc);
						} else {
							// No match
							activeMatch = null;
							decorations = DecorationSet.empty;
						}
					} else {
						// No word at cursor
						activeMatch = null;
						decorations = DecorationSet.empty;
					}
				} else if (activeMatch) {
					// Map existing decorations
					decorations = decorations.map(tr.mapping, tr.doc);
				}

				return {
					...state,
					activeMatch,
					decorations
				};
			}
		},

		props: {
			decorations(state) {
				return this.getState(state)?.decorations;
			},

			handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
				const state = textSnippetKey.getState(view.state);
				if (!state?.activeMatch) {
					return false;
				}

				// Space key: apply replacement
				if (event.key === ' ' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
					event.preventDefault();
					applyReplacement(view, state.activeMatch);
					return true;
				}

				// Escape key: cancel and clear match
				if (event.key === 'Escape') {
					event.preventDefault();
					cancelMatch(view);
					return true;
				}

				return false;
			}
		}
	});
}

/**
 * Apply the text replacement
 */
function applyReplacement(view: EditorView, match: TextSnippetMatch): void {
	const { from, to, replacement } = match;
	const state = view.state;
	const tr = state.tr;
	const schema = state.schema;

	// Check if there's already a space after the trigger
	const textAfter = state.doc.textBetween(to, Math.min(to + 1, state.doc.content.size), '\n', '\ufffc');
	const hasSpaceAfter = textAfter && /\s/.test(textAfter[0]);

	// Only add non-breaking space if there's no space after (i.e., at end of paragraph)
	const textToInsert = hasSpaceAfter ? replacement : replacement + '\u00A0';
	const textNode = schema.text(textToInsert);
	tr.replaceWith(from, to, textNode);

	// Position cursor after inserted text (before existing space if any, after our space if we added one)
	const newCursorPos = from + textToInsert.length + (hasSpaceAfter ? 1 : 0);
	tr.setSelection(TextSelection.create(tr.doc, newCursorPos));

	// Clear the match state
	tr.setMeta(textSnippetKey, { cancel: true });

	view.dispatch(tr);
}

/**
 * Cancel the current match
 */
function cancelMatch(view: EditorView): void {
	const tr = view.state.tr;
	tr.setMeta(textSnippetKey, { cancel: true });

	// Insert a space
	const { $from } = view.state.selection;
	tr.insertText(' ', $from.pos);

	view.dispatch(tr);
}

/**
 * Update entries in the plugin
 */
export function updateTextSnippetEntries(view: EditorView, entries: TextSnippetEntry[]): void {
	const tr = view.state.tr;
	tr.setMeta(textSnippetKey, { entries });
	view.dispatch(tr);
}
