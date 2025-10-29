/**
 * Auto-Confirm Plugin
 *
 * Automatically approves words after a configurable timeout if not manually approved
 * Each word is tracked individually and confirmed in real-time
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { AutoConfirmConfig } from '../utils/types';
import { approveWordAtPosition } from './wordApproval';

export interface AutoConfirmState {
	config: AutoConfirmConfig;
	wordTimers: Map<string, NodeJS.Timeout>; // wordId -> timer
	editorView: EditorView | null; // Store reference for timer callbacks
}

export const autoConfirmKey = new PluginKey<AutoConfirmState>('autoConfirm');

/**
 * Create auto-confirm plugin
 *
 * Schedules timers immediately when words appear (in appendTransaction)
 * Timers are scheduled synchronously with document changes for immediate auto-confirm
 */
export function autoConfirmPlugin(initialConfig: AutoConfirmConfig = { enabled: true, timeoutSeconds: 5 }) {
	return new Plugin<AutoConfirmState>({
		key: autoConfirmKey,

		state: {
			init(): AutoConfirmState {
				return {
					config: initialConfig,
					wordTimers: new Map(),
					editorView: null
				};
			},

			apply(tr, value): AutoConfirmState {
				let { config, wordTimers, editorView } = value;

				// Update config if changed
				const newConfig = tr.getMeta('updateAutoConfirm');
				if (newConfig) {
					config = newConfig;

					// Clear all existing timers if disabled
					if (!config.enabled) {
						wordTimers.forEach((timer) => clearTimeout(timer));
						wordTimers = new Map();
					}
				}

				// Clean up timers for approved words
				if (tr.docChanged) {
					const approvedWordIds = new Set<string>();

					// Find all approved words
					tr.doc.descendants((node) => {
						if (node.isText && node.marks.length > 0) {
							const wordMark = node.marks.find((mark) => mark.type.name === 'word');
							if (wordMark && wordMark.attrs.approved) {
								approvedWordIds.add(wordMark.attrs.id);
							}
						}
					});

					// Clear timers for approved words
					approvedWordIds.forEach((wordId) => {
						const timer = wordTimers.get(wordId);
						if (timer) {
							clearTimeout(timer);
							wordTimers.delete(wordId);
						}
					});
				}

				return {
					config,
					wordTimers,
					editorView
				};
			}
		},

		// Schedule timers immediately when words appear in document
		appendTransaction(transactions, oldState, newState) {
			const pluginState = autoConfirmKey.getState(newState);
			console.log('[AUTO-CONFIRM] appendTransaction called, pluginState:', !!pluginState, 'enabled:', pluginState?.config.enabled, 'editorView:', !!pluginState?.editorView);

			if (!pluginState || !pluginState.config.enabled || !pluginState.editorView) {
				console.log('[AUTO-CONFIRM] Skipping - missing requirements');
				return null;
			}

			// Only schedule timers if document changed
			const docChanged = transactions.some(tr => tr.docChanged);
			console.log('[AUTO-CONFIRM] docChanged:', docChanged);
			if (!docChanged) {
				return null;
			}

			// Find all non-approved words and schedule timers if not already scheduled
			let scheduledCount = 0;
			newState.doc.descendants((node, pos) => {
				if (node.isText && node.marks.length > 0) {
					const wordMark = node.marks.find((mark) => mark.type.name === 'word');

					// Schedule timers for all non-approved words
					if (wordMark && !wordMark.attrs.approved) {
						const wordId = wordMark.attrs.id;

						// If this word doesn't have a timer yet, schedule one
						if (!pluginState.wordTimers.has(wordId)) {
						scheduledCount++;
							const timeout = setTimeout(() => {
								// Find word by ID and approve it
								const currentState = pluginState.editorView!.state;
								let wordPos: number | null = null;

								currentState.doc.descendants((n, p) => {
									if (n.isText && n.marks.length > 0) {
										const mark = n.marks.find((m) => m.type.name === 'word' && m.attrs.id === wordId);
										if (mark && !mark.attrs.approved) {
											wordPos = p;
											return false; // Stop searching
										}
									}
								});

								if (wordPos !== null) {
									approveWordAtPosition(currentState, pluginState.editorView!.dispatch, wordPos);

									// Check if this was the last pending word
									setTimeout(() => {
										const latestState = pluginState.editorView!.state;
										let hasPendingWords = false;

										latestState.doc.descendants((n) => {
											if (n.isText && n.marks.length > 0) {
												const wMark = n.marks.find((m) => m.type.name === 'word');
												const pMark = n.marks.find((m) => m.type.name === 'pending');
												if (wMark && pMark && !wMark.attrs.approved) {
													hasPendingWords = true;
													return false;
												}
											}
										});

										if (!hasPendingWords) {
											const tr = latestState.tr;
											tr.setMeta('allWordsApproved', true);
											pluginState.editorView!.dispatch(tr);
										}
									}, 100);
								}

								// Clean up timer
								pluginState.wordTimers.delete(wordId);
							}, pluginState.config.timeoutSeconds * 1000);

							pluginState.wordTimers.set(wordId, timeout);
						}
					}
				}
			});

			console.log('[AUTO-CONFIRM] Scheduled', scheduledCount, 'new timers');
			return null; // Don't create additional transactions
		},

		view(editorView: EditorView) {
			// Store editor view reference for timer callbacks
			const pluginState = autoConfirmKey.getState(editorView.state);
			if (pluginState) {
				pluginState.editorView = editorView;
			}

			return {
				update(view, prevState) {
					// Timer scheduling is now handled in appendTransaction for immediate scheduling
					// This hook is kept for any future view-specific updates
				},

				destroy() {
					// Clean up all timers
					const pluginState = autoConfirmKey.getState(editorView.state);
					if (pluginState) {
						pluginState.wordTimers.forEach((timer) => clearTimeout(timer));
						pluginState.wordTimers.clear();
					}
				}
			};
		}
	});
}

/**
 * Helper: Update auto-confirm config
 */
export function updateAutoConfirmConfig(
	state: EditorState,
	dispatch: (tr: Transaction) => void,
	config: AutoConfirmConfig
): boolean {
	const tr = state.tr;
	tr.setMeta('updateAutoConfirm', config);
	dispatch(tr);
	return true;
}
