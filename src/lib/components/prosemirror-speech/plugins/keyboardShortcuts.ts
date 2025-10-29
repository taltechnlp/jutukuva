/**
 * Keyboard Shortcuts Plugin
 *
 * Handles keyboard navigation and approval shortcuts
 */

import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import type { Command } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import {
	wordApprovalKey,
	approveUpToCurrentWordCommand
} from './wordApproval';

/**
 * Find the next word position after the current position
 */
function findNextWordPos(state: any, currentPos: number | null): number | null {
	let nextPos: number | null = null;
	const startPos = currentPos !== null ? currentPos + 1 : 0;

	state.doc.descendants((node: any, pos: number) => {
		if (nextPos !== null) return false; // Already found

		if (pos >= startPos && node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark: any) => mark.type.name === 'word');
			if (wordMark && !wordMark.attrs.approved) {
				nextPos = pos;
				return false; // Stop traversal
			}
		}
	});

	return nextPos;
}

/**
 * Find the previous word position before the current position
 */
function findPrevWordPos(state: any, currentPos: number | null): number | null {
	const words: number[] = [];

	state.doc.descendants((node: any, pos: number) => {
		if (node.isText && node.marks.length > 0) {
			const wordMark = node.marks.find((mark: any) => mark.type.name === 'word');
			if (wordMark && !wordMark.attrs.approved) {
				words.push(pos);
			}
		}
	});

	if (currentPos === null) {
		return words.length > 0 ? words[0] : null;
	}

	// Find last word before current position
	for (let i = words.length - 1; i >= 0; i--) {
		if (words[i] < currentPos) {
			return words[i];
		}
	}

	return null;
}

/**
 * Navigate to next word
 * Selects the entire word with cursor at the end
 */
const nextWordCommand: Command = (state, dispatch) => {
	const pluginState = wordApprovalKey.getState(state);
	if (!pluginState) return false;

	const nextPos = findNextWordPos(state, pluginState.activeWordPos);
	if (nextPos === null) return false;

	if (dispatch) {
		// Find the word node to get its full range
		const node = state.doc.nodeAt(nextPos);
		if (!node || !node.isText) return false;

		const wordStart = nextPos;
		const wordEnd = nextPos + node.nodeSize;

		const tr = state.tr;
		tr.setMeta('setActiveWord', nextPos);
		// Select the entire word with cursor at the end (head at end, anchor at start)
		tr.setSelection(TextSelection.create(state.doc, wordStart, wordEnd));
		dispatch(tr);
	}

	return true;
};

/**
 * Navigate to previous word
 * Selects the entire word with cursor at the beginning
 */
const prevWordCommand: Command = (state, dispatch) => {
	const pluginState = wordApprovalKey.getState(state);
	if (!pluginState) return false;

	const prevPos = findPrevWordPos(state, pluginState.activeWordPos);
	if (prevPos === null) return false;

	if (dispatch) {
		// Find the word node to get its full range
		const node = state.doc.nodeAt(prevPos);
		if (!node || !node.isText) return false;

		const wordStart = prevPos;
		const wordEnd = prevPos + node.nodeSize;

		const tr = state.tr;
		tr.setMeta('setActiveWord', prevPos);
		// Select the entire word with cursor at the beginning (head at start, anchor at end)
		tr.setSelection(TextSelection.create(state.doc, wordEnd, wordStart));
		dispatch(tr);
	}

	return true;
};

/**
 * Plugin to handle text input and preserve word marks when replacing word text
 */
export function textInputPlugin() {
	return new Plugin({
		props: {
			handleTextInput(view, from, to, text) {
				const { state, dispatch } = view;
				const { selection, doc, schema } = state;

				// Check if we're replacing a selected word
				if (selection.from !== from || selection.to !== to) {
					return false; // Let default handling occur
				}

				// Find if there's a word mark in the selection
				let wordMark = null;
				doc.nodesBetween(from, to, (node, pos) => {
					if (node.isText && node.marks.length > 0) {
						const mark = node.marks.find((m) => m.type.name === 'word');
						if (mark) {
							wordMark = mark;
							return false; // Stop iteration
						}
					}
				});

				// If we found a word mark, preserve it when replacing
				if (wordMark) {
					const tr = state.tr;
					// Delete the selected content
					tr.delete(from, to);
					// Insert new text with the word mark preserved
					tr.insert(from, schema.text(text, [wordMark]));
					dispatch(tr);
					return true; // We handled it
				}

				return false; // Let default handling occur
			}
		}
	});
}

/**
 * Create keyboard shortcuts plugin
 */
export function keyboardShortcutsPlugin() {
	return keymap({
		// Navigation
		Tab: nextWordCommand,
		'Shift-Tab': prevWordCommand,
		ArrowRight: nextWordCommand,
		ArrowLeft: prevWordCommand,

		// Approval - Enter confirms everything from start up to and including current word
		Enter: approveUpToCurrentWordCommand,

		// Undo/Redo
		'Mod-z': undo,
		'Mod-y': redo,
		'Mod-Shift-z': redo,

		// Escape: would cancel edit / revert word (implement in future)
		Escape: (state, dispatch) => {
			// TODO: Implement revert to original ASR word
			console.log('Escape: Revert not yet implemented');
			return true;
		}
	});
}
