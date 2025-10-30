/**
 * Keyboard Shortcuts Plugin
 *
 * Handles keyboard navigation and approval shortcuts
 */

import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import {
	wordApprovalKey,
	approveUpToCurrentWordCommand
} from './wordApproval';

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
 */
const nextWordCommand: Command = (state, dispatch) => {
	const pluginState = wordApprovalKey.getState(state);
	if (!pluginState) return false;

	const nextPos = findNextWordPos(state, pluginState.activeWordPos);
	if (nextPos === null) return false;

	if (dispatch) {
		const node = state.doc.nodeAt(nextPos);
		if (!node) return false;

		console.log('[NAV] Selecting word at pos', nextPos, 'text:', node.text, 'size:', node.nodeSize);

		const tr = state.tr;
		tr.setMeta('setActiveWord', nextPos);
		// Select the entire word so typing replaces it
		const selection = TextSelection.create(state.doc, nextPos, nextPos + node.nodeSize);
		console.log('[NAV] Created selection from', nextPos, 'to', nextPos + node.nodeSize, 'empty:', selection.empty);
		tr.setSelection(selection);
		dispatch(tr);
	}

	return true;
};

/**
 * Navigate to previous word
 */
const prevWordCommand: Command = (state, dispatch) => {
	const pluginState = wordApprovalKey.getState(state);
	if (!pluginState) return false;

	const prevPos = findPrevWordPos(state, pluginState.activeWordPos);
	if (prevPos === null) return false;

	if (dispatch) {
		const node = state.doc.nodeAt(prevPos);
		if (!node) return false;

		const tr = state.tr;
		tr.setMeta('setActiveWord', prevPos);
		// Select the entire word so typing replaces it
		tr.setSelection(TextSelection.create(state.doc, prevPos, prevPos + node.nodeSize));
		dispatch(tr);
	}

	return true;
};

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
		'Mod-z': undoCommand,
		'Mod-y': redoCommand,
		'Mod-Shift-z': redoCommand,

		// Escape: would cancel edit / revert word (implement in future)
		Escape: (state, dispatch) => {
			// TODO: Implement revert to original ASR word
			console.log('Escape: Revert not yet implemented');
			return true;
		}
	});
}
