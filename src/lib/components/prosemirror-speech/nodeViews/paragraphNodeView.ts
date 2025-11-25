/**
 * Custom ProseMirror NodeView for paragraphs with speaker prefix
 */

import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Speaker } from '$lib/collaboration/types';
import { speakerDropdownKey } from '../plugins/keyboardShortcuts';
import SpeakerPrefix from '../SpeakerPrefix.svelte';
import { mount, unmount } from 'svelte';
import { writable } from 'svelte/store';

export interface ParagraphNodeViewContext {
	getSpeakers: () => Speaker[];
	getSpeaker: (id: string) => Speaker | undefined;
	addSpeaker: (name: string) => Speaker;
	readOnly: boolean;
}

export function createParagraphNodeView(
	node: Node,
	view: EditorView,
	getPos: () => number | undefined,
	context: ParagraphNodeViewContext
): NodeView {
	// Create container paragraph element
	const dom = document.createElement('p');
	dom.className = 'paragraph-with-speaker';

	// Copy data attributes from node
	if (node.attrs.segmentIndex !== null) {
		dom.setAttribute('data-segment-index', String(node.attrs.segmentIndex));
	}
	if (node.attrs.segmentStartTime !== null) {
		dom.setAttribute('data-start', String(node.attrs.segmentStartTime));
	}
	if (node.attrs.segmentEndTime !== null) {
		dom.setAttribute('data-end', String(node.attrs.segmentEndTime));
	}
	if (node.attrs.speakerId) {
		dom.setAttribute('data-speaker-id', node.attrs.speakerId);
	}

	// Create non-editable prefix container
	const prefixContainer = document.createElement('span');
	prefixContainer.className = 'speaker-prefix-mount';
	prefixContainer.contentEditable = 'false';

	// Create editable content container
	const contentDOM = document.createElement('span');
	contentDOM.className = 'paragraph-content';

	dom.appendChild(prefixContainer);
	dom.appendChild(contentDOM);

	// Get current speaker info
	const speakerId = node.attrs.speakerId;
	const speaker = speakerId ? context.getSpeaker(speakerId) : undefined;

	// Create stores for reactive props
	const speakerIdStore = writable<string | null>(speakerId);
	const speakerNameStore = writable(speaker?.name || '');
	const speakerColorStore = writable(speaker?.color || '');
	const speakersStore = writable<Speaker[]>(context.getSpeakers());
	const showDropdownStore = writable(false);

	// Mount Svelte component with stores
	const prefixComponent = mount(SpeakerPrefix, {
		target: prefixContainer,
		props: {
			speakerIdStore,
			speakerNameStore,
			speakerColorStore,
			speakersStore,
			showDropdownStore,
			readOnly: context.readOnly,
			onSelect: (selectedSpeaker: Speaker | null) => {
				const pos = getPos();
				if (pos === undefined) return;

				const tr = view.state.tr.setNodeMarkup(pos, undefined, {
					...node.attrs,
					speakerId: selectedSpeaker?.id || null
				});
				view.dispatch(tr);
			},
			onAddSpeaker: (name: string): Speaker => {
				return context.addSpeaker(name);
			},
			onDropdownToggle: (show: boolean) => {
				showDropdownStore.set(show);
			}
		}
	});

	// Function to update store values
	function updateStores() {
		const speakerId = node.attrs.speakerId;
		const speaker = speakerId ? context.getSpeaker(speakerId) : undefined;

		speakerIdStore.set(speakerId);
		speakerNameStore.set(speaker?.name || '');
		speakerColorStore.set(speaker?.color || '');
		speakersStore.set(context.getSpeakers());
	}

	return {
		dom,
		contentDOM,

		update(newNode: Node): boolean {
			if (newNode.type.name !== 'paragraph') return false;

			// Update node reference
			node = newNode;

			// Update data attributes
			if (newNode.attrs.segmentIndex !== null) {
				dom.setAttribute('data-segment-index', String(newNode.attrs.segmentIndex));
			}
			if (newNode.attrs.segmentStartTime !== null) {
				dom.setAttribute('data-start', String(newNode.attrs.segmentStartTime));
			}
			if (newNode.attrs.segmentEndTime !== null) {
				dom.setAttribute('data-end', String(newNode.attrs.segmentEndTime));
			}
			if (newNode.attrs.speakerId) {
				dom.setAttribute('data-speaker-id', newNode.attrs.speakerId);
			} else {
				dom.removeAttribute('data-speaker-id');
			}

			// Check if we should show the dropdown based on plugin state
			const pos = getPos();
			if (pos !== undefined) {
				const pluginState = speakerDropdownKey.getState(view.state);
				if (pluginState?.showDropdownAtPos === pos) {
					showDropdownStore.set(true);
				}
			}

			// Update stores
			updateStores();

			return true;
		},

		destroy() {
			unmount(prefixComponent);
		},

		// Prevent selection/events in prefix area
		stopEvent(event: Event): boolean {
			return prefixContainer.contains(event.target as HTMLElement);
		},

		// Prevent ProseMirror from seeing mutations in prefix
		ignoreMutation(mutation: MutationRecord): boolean {
			return !contentDOM.contains(mutation.target);
		}
	};
}
