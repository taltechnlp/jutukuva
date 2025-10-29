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
	finalWordTimers: Map<string, NodeJS.Timeout>; // wordId -> timer
}

export const autoConfirmKey = new PluginKey<AutoConfirmState>('autoConfirm');

/**
 * Create auto-confirm plugin (simplified for final-word approach)
 *
 * Only schedules timers for words when they become final (appear in 2+ consecutive ASR results)
 * This is much simpler than tracking all pending words - final words are stable and won't be deleted
 */
export function autoConfirmPlugin(initialConfig: AutoConfirmConfig = { enabled: true, timeoutSeconds: 5 }) {
	return new Plugin<AutoConfirmState>({
		key: autoConfirmKey,

		state: {
			init(): AutoConfirmState {
				return {
					config: initialConfig,
					finalWordTimers: new Map()
				};
			},

			apply(tr, value): AutoConfirmState {
				let { config, finalWordTimers } = value;

				// Update config if changed
				const newConfig = tr.getMeta('updateAutoConfirm');
				if (newConfig) {
					config = newConfig;

					// Clear all existing timers if disabled
					if (!config.enabled) {
						finalWordTimers.forEach((timer) => clearTimeout(timer));
						finalWordTimers = new Map();
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
						const timer = finalWordTimers.get(wordId);
						if (timer) {
							clearTimeout(timer);
							finalWordTimers.delete(wordId);
						}
					});
				}

				return {
					config,
					finalWordTimers
				};
			}
		},

		view(editorView: EditorView) {
			return {
				update(view, prevState) {
					const pluginState = autoConfirmKey.getState(view.state);
					if (!pluginState || !pluginState.config.enabled) {
						return;
					}

					// Only schedule timers for final words on doc changes
					if (view.state.doc !== prevState.doc) {
						// Find all final words that don't have timers yet
						view.state.doc.descendants((node, pos) => {
							if (node.isText && node.marks.length > 0) {
								const wordMark = node.marks.find((mark) => mark.type.name === 'word');

								// Only schedule timers for FINAL words that aren't approved yet
								if (wordMark && wordMark.attrs.final && !wordMark.attrs.approved) {
									const wordId = wordMark.attrs.id;

									// If this word doesn't have a timer yet, schedule one
									if (!pluginState.finalWordTimers.has(wordId)) {
										const timeout = setTimeout(() => {
											// Find word by ID and approve it
											const currentState = view.state;
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
												approveWordAtPosition(currentState, view.dispatch, wordPos);

												// Check if this was the last pending word
												setTimeout(() => {
													const latestState = view.state;
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
														view.dispatch(tr);
													}
												}, 100);
											}

											// Clean up timer
											pluginState.finalWordTimers.delete(wordId);
										}, pluginState.config.timeoutSeconds * 1000);

										pluginState.finalWordTimers.set(wordId, timeout);
									}
								}
							}
						});
					}
				},

				destroy() {
					// Clean up all timers
					const pluginState = autoConfirmKey.getState(editorView.state);
					if (pluginState) {
						pluginState.finalWordTimers.forEach((timer) => clearTimeout(timer));
						pluginState.finalWordTimers.clear();
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
