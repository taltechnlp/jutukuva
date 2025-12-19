/**
 * Keyboard Shortcuts Plugin
 *
 * Handles keyboard shortcuts for editing
 */

import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import type { Command, Transaction } from 'prosemirror-state';
import { TextSelection, PluginKey, Plugin } from 'prosemirror-state';
import { splitBlock } from 'prosemirror-commands';

/**
 * Plugin key for tracking speaker dropdown state
 */
export const speakerDropdownKey = new PluginKey<{ showDropdownAtPos: number | null }>('speakerDropdown');

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

	if (wordStart === wordEnd) return true; // No word found, but prevent default Tab behavior

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
 * Enter command that creates new paragraph without opening speaker dropdown
 * Speaker stays empty - user must explicitly use Ctrl+Enter to set speaker
 */
const enterCommand: Command = (state, dispatch) => {
	if (!dispatch) {
		return splitBlock(state, dispatch);
	}

	// Wrap dispatch to inject deduplication flag
	const wrappedDispatch = (tr: Transaction) => {
		tr.setMeta('manualParagraphCreated', true);
		dispatch(tr);
	};

	return splitBlock(state, wrappedDispatch);
};

/**
 * Ctrl+Enter command that creates new paragraph and opens speaker dropdown
 */
const enterWithSpeakerDropdown: Command = (state, dispatch, view) => {
	if (!dispatch || !view) {
		return splitBlock(state, dispatch);
	}

	// Wrap dispatch to inject deduplication flag
	const wrappedDispatch = (tr: Transaction) => {
		tr.setMeta('manualParagraphCreated', true);
		dispatch(tr);
	};

	// Perform the split
	if (!splitBlock(state, wrappedDispatch)) return false;

	// Open speaker dropdown by directly clicking the prefix button
	setTimeout(() => {
		const { $from } = view.state.selection;

		// Get the DOM element at the current cursor position
		const domAtCursor = view.domAtPos($from.pos);

		// Traverse up to find the paragraph element
		let paragraphDom: HTMLElement | null = domAtCursor.node as HTMLElement;
		if (paragraphDom.nodeType === Node.TEXT_NODE) {
			paragraphDom = paragraphDom.parentElement;
		}
		while (paragraphDom && !paragraphDom.classList?.contains('paragraph-with-speaker')) {
			paragraphDom = paragraphDom.parentElement;
		}

		const prefixButton = paragraphDom?.querySelector('.speaker-prefix');
		if (prefixButton) {
			(prefixButton as HTMLElement).click();
		}
	}, 10);

	return true;
};

/**
 * Navigate to speaker selection when at paragraph start
 * Opens the speaker dropdown
 */
const navigateToSpeakerSelection: Command = (state, dispatch, view) => {
	if (!view) return false;

	const { $from } = state.selection;

	// Check if cursor is at the start of paragraph content
	const paragraphStart = $from.start($from.depth);
	const isAtStart = $from.pos === paragraphStart;

	if (!isAtStart) return false;

	// Get the DOM element at the current cursor position (same logic as Ctrl+Enter)
	const domAtCursor = view.domAtPos($from.pos);

	// Traverse up to find the paragraph element
	let paragraphDom: HTMLElement | null = domAtCursor.node as HTMLElement;
	if (paragraphDom.nodeType === Node.TEXT_NODE) {
		paragraphDom = paragraphDom.parentElement;
	}
	while (paragraphDom && !paragraphDom.classList?.contains('paragraph-with-speaker')) {
		paragraphDom = paragraphDom.parentElement;
	}

	const prefixButton = paragraphDom?.querySelector('.speaker-prefix');
	if (prefixButton) {
		(prefixButton as HTMLElement).click();
		return true;
	}

	// If no button found, let default behavior handle it
	return false;
};

/**
 * Plugin to track speaker dropdown state
 */
export function speakerDropdownPlugin() {
	return new Plugin({
		key: speakerDropdownKey,
		state: {
			init() {
				return { showDropdownAtPos: null };
			},
			apply(tr, value) {
				const meta = tr.getMeta(speakerDropdownKey);
				if (meta) {
					return meta;
				}
				// Clear after any other transaction
				if (tr.docChanged || tr.selectionSet) {
					return { showDropdownAtPos: null };
				}
				return value;
			}
		}
	});
}

/**
 * Create keyboard shortcuts plugin
 */
export function keyboardShortcutsPlugin() {
	// Plugin to handle Ctrl+Enter before the keymap processes it
	const ctrlEnterPlugin = new Plugin({
		props: {
			handleKeyDown(view, event) {
				if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
					event.preventDefault();
					enterWithSpeakerDropdown(view.state, view.dispatch, view);
					return true;
				}
				return false;
			}
		}
	});

	const keymapPlugin = keymap({
		// Enter creates a new paragraph (no speaker dropdown)
		Enter: enterCommand,

		// Tab selects next word, Shift+Tab at start opens speaker dropdown
		Tab: selectNextWord,
		'Shift-Tab': (state, dispatch, view) => {
			// At paragraph start: navigate to speaker selection
			const { $from } = state.selection;
			const paragraphStart = $from.start($from.depth);
			if ($from.pos === paragraphStart) {
				return navigateToSpeakerSelection(state, dispatch, view);
			}
			// Otherwise: select previous word
			return selectPreviousWord(state, dispatch);
		},

		// ArrowLeft at paragraph start opens speaker selection
		ArrowLeft: (state, dispatch, view) => {
			const { $from } = state.selection;
			const paragraphStart = $from.start($from.depth);
			if ($from.pos === paragraphStart) {
				return navigateToSpeakerSelection(state, dispatch, view);
			}
			// Let default behavior handle it
			return false;
		},

		// Undo/Redo
		'Mod-z': undoCommand,
		'Mod-y': redoCommand,
		'Mod-Shift-z': redoCommand
	});

	// Return both plugins - ctrlEnterPlugin must come first to intercept Ctrl+Enter
	return [ctrlEnterPlugin, keymapPlugin];
}
