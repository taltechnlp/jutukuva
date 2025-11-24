/**
 * Keyboard Shortcuts Plugin
 *
 * Handles keyboard shortcuts for editing
 */

import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import { splitBlock } from 'prosemirror-commands';

/**
 * Wrap undo to add metadata
 */
const undoCommand: Command = (state, dispatch) => {
	return undo(state, dispatch ? (tr) => {
		tr.setMeta('isHistoryAction', true);
		dispatch(tr);
	} : undefined);
};

/**
 * Wrap redo to add metadata
 */
const redoCommand: Command = (state, dispatch) => {
	return redo(state, dispatch ? (tr) => {
		tr.setMeta('isHistoryAction', true);
		dispatch(tr);
	} : undefined);
};

/**
 * Select next word command
 * Skips to the end of current word, then selects the next word
 */
const selectNextWord: Command = (state, dispatch) => {
	const { selection, doc } = state;
	const { $from } = selection;

	// Get the text content from current position to end of document
	const text = doc.textBetween($from.pos, doc.content.size, '\n', '\ufffc');

	if (!text) return false;

	// Find the end of current word (skip non-whitespace)
	let offset = 0;
	while (offset < text.length && !/\s/.test(text[offset])) {
		offset++;
	}

	// Skip whitespace
	while (offset < text.length && /\s/.test(text[offset])) {
		offset++;
	}

	// Find end of next word
	const wordStart = offset;
	while (offset < text.length && !/\s/.test(text[offset])) {
		offset++;
	}

	const wordEnd = offset;

	if (wordStart === wordEnd) return false; // No word found

	// Create selection from wordStart to wordEnd
	const from = $from.pos + wordStart;
	const to = $from.pos + wordEnd;

	if (dispatch) {
		const tr = state.tr.setSelection(
			TextSelection.create(doc, from, to)
		);
		dispatch(tr);
	}

	return true;
};

/**
 * Select previous word command
 * Skips to the beginning of current word, then selects the previous word
 */
const selectPreviousWord: Command = (state, dispatch) => {
	const { selection, doc } = state;
	const { $from } = selection;

	// Find the start of the current text block
	const textStart = $from.start();

	// Get the text content from start of text block to current position
	const text = doc.textBetween(textStart, $from.pos, '\n', '\ufffc');

	if (!text) return true; // No text, but prevent default Tab behavior

	// Start from the end and work backwards
	let offset = text.length;

	// Find the beginning of current word (skip non-whitespace backwards)
	while (offset > 0 && !/\s/.test(text[offset - 1])) {
		offset--;
	}

	// Skip whitespace backwards
	while (offset > 0 && /\s/.test(text[offset - 1])) {
		offset--;
	}

	// Find beginning of previous word
	const wordEnd = offset;
	while (offset > 0 && !/\s/.test(text[offset - 1])) {
		offset--;
	}

	const wordStart = offset;

	if (wordStart === wordEnd) return true; // No word found, but prevent default behavior

	// Create selection from wordStart to wordEnd (add textStart offset)
	const from = textStart + wordStart;
	const to = textStart + wordEnd;

	if (dispatch) {
		const tr = state.tr.setSelection(
			TextSelection.create(doc, from, to)
		);
		dispatch(tr);
	}

	return true;
};

/**
 * Create keyboard shortcuts plugin
 */
export function keyboardShortcutsPlugin() {
	return keymap({
		// Enter creates a new paragraph
		Enter: splitBlock,

		// Tab selects next word, Shift+Tab selects previous word
		Tab: selectNextWord,
		'Shift-Tab': selectPreviousWord,

		// Undo/Redo
		'Mod-z': undoCommand,
		'Mod-y': redoCommand,
		'Mod-Shift-z': redoCommand
	});
}
