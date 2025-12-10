<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { clickOutside } from './utils/clickOutside';
	import type { Speaker } from '$lib/collaboration/types';

	let {
		speakers = [],
		selectedId = null,
		isOpen = false,
		onSelect,
		onAddSpeaker,
		onClose
	}: {
		speakers: Speaker[];
		selectedId: string | null;
		isOpen: boolean;
		onSelect: (speaker: Speaker) => void;
		onAddSpeaker: (name: string) => Speaker;
		onClose: () => void;
	} = $props();

	let newSpeakerName = $state('');
	let inputElement: HTMLInputElement | null = $state(null);
	let dropdownElement: HTMLDivElement | null = $state(null);
	let anchorElement: HTMLSpanElement | null = $state(null);
	let highlightedIndex = $state(0);
	let dropdownStyle = $state('');

	// Portal action - moves the element to body
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	// Filter speakers based on input - case insensitive prefix/contains match
	const filteredSpeakers = $derived(() => {
		const query = newSpeakerName.trim().toLowerCase();
		if (!query) return speakers;

		// Sort by match quality: prefix matches first, then contains matches
		return speakers
			.filter(s => s.name.toLowerCase().includes(query))
			.sort((a, b) => {
				const aStartsWith = a.name.toLowerCase().startsWith(query);
				const bStartsWith = b.name.toLowerCase().startsWith(query);
				if (aStartsWith && !bStartsWith) return -1;
				if (!aStartsWith && bStartsWith) return 1;
				return a.name.localeCompare(b.name);
			});
	});

	// Check if current input exactly matches an existing speaker
	const exactMatch = $derived(() => {
		const query = newSpeakerName.trim().toLowerCase();
		return speakers.find(s => s.name.toLowerCase() === query);
	});

	function handleSelect(speaker: Speaker) {
		onSelect(speaker);
		newSpeakerName = '';
		onClose();
	}

	function handleAddNew() {
		const trimmed = newSpeakerName.trim();
		if (trimmed) {
			// Check if there's an exact match first
			if (exactMatch()) {
				handleSelect(exactMatch()!);
				return;
			}
			const newSpeaker = onAddSpeaker(trimmed);
			onSelect(newSpeaker);
			newSpeakerName = '';
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		const filtered = filteredSpeakers();

		if (e.key === 'Enter') {
			e.preventDefault();
			// If there are filtered matches and input has text, select the highlighted one
			if (filtered.length > 0 && newSpeakerName.trim()) {
				handleSelect(filtered[highlightedIndex]);
			} else if (newSpeakerName.trim()) {
				// No matches, create new speaker
				handleAddNew();
			}
		} else if (e.key === 'Escape') {
			onClose();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (filtered.length > 0) {
				highlightedIndex = (highlightedIndex + 1) % filtered.length;
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (filtered.length > 0) {
				highlightedIndex = (highlightedIndex - 1 + filtered.length) % filtered.length;
			}
		} else if (e.key === 'Tab' && filtered.length > 0 && newSpeakerName.trim()) {
			// Tab to autocomplete the highlighted suggestion
			e.preventDefault();
			newSpeakerName = filtered[highlightedIndex].name;
		}
	}

	function handleOutclick() {
		onClose();
	}

	// Reset highlighted index when filtered list changes
	$effect(() => {
		filteredSpeakers(); // subscribe to changes
		highlightedIndex = 0;
	});

	// Calculate fixed position based on anchor element
	function updatePosition() {
		if (!anchorElement || !dropdownElement) return;

		const anchorRect = anchorElement.getBoundingClientRect();
		const dropdownRect = dropdownElement.getBoundingClientRect();
		const viewportHeight = window.innerHeight;
		const dropdownHeight = dropdownRect.height;
		const spaceBelow = viewportHeight - anchorRect.bottom;
		const spaceAbove = anchorRect.top;

		// Decide whether to open upward or downward
		const openUpward = spaceBelow < dropdownHeight + 20 && spaceAbove > spaceBelow;

		let top: number;
		if (openUpward) {
			top = anchorRect.top - dropdownHeight - 4;
		} else {
			top = anchorRect.bottom + 4;
		}

		dropdownStyle = `left: ${anchorRect.left}px; top: ${top}px;`;
	}

	// Position dropdown when it opens
	$effect(() => {
		if (isOpen && dropdownElement && anchorElement) {
			updatePosition();
			// Focus input after position is calculated
			setTimeout(() => inputElement?.focus(), 10);
		}
	});

	// Reset state when closing
	$effect(() => {
		if (!isOpen) {
			newSpeakerName = '';
			highlightedIndex = 0;
			dropdownStyle = '';
		}
	});
</script>

<!-- Invisible anchor to track position -->
<span bind:this={anchorElement} class="dropdown-anchor"></span>

{#if isOpen}
	<!-- Portal: render dropdown at body level to escape overflow constraints -->
	<div
		bind:this={dropdownElement}
		class="speaker-dropdown"
		style={dropdownStyle}
		use:portal
		use:clickOutside={handleOutclick}
	>
		<!-- New speaker input -->
		<div class="dropdown-input">
			<input
				bind:this={inputElement}
				bind:value={newSpeakerName}
				placeholder={$_('speakers.addNew')}
				onkeydown={handleKeydown}
				class="input input-sm input-bordered flex-1"
			/>
			<button
				type="button"
				class="btn btn-sm btn-primary"
				onclick={handleAddNew}
				disabled={!newSpeakerName.trim()}
			>
				{$_('common.add')}
			</button>
		</div>

		<!-- Filtered speakers list -->
		{#if filteredSpeakers().length > 0}
			<ul class="speaker-list">
				{#each filteredSpeakers() as speaker, index}
					<li
						class="hover:bg-base-200"
						class:selected={speaker.id === selectedId}
						class:highlighted={index === highlightedIndex && newSpeakerName.trim()}
						onclick={() => handleSelect(speaker)}
						onkeydown={(e) => e.key === 'Enter' && handleSelect(speaker)}
						role="option"
						aria-selected={speaker.id === selectedId}
						tabindex="0"
					>
						<span class="speaker-color" style:background-color={speaker.color}></span>
						<span class="speaker-name">{speaker.name}</span>
						{#if index === highlightedIndex && newSpeakerName.trim()}
							<span class="hint">↵</span>
						{/if}
					</li>
				{/each}
			</ul>
		{:else if newSpeakerName.trim()}
			<div class="no-matches">
				{$_('speakers.noMatches')}
			</div>
		{/if}
	</div>
{/if}

<style>
	.dropdown-anchor {
		position: absolute;
		width: 0;
		height: 0;
		pointer-events: none;
	}

	/* Use :global since dropdown is portaled to body */
	:global(.speaker-dropdown) {
		position: fixed;
		z-index: 10000;
		border-radius: 0.5rem;
		box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.15);
		min-width: 220px;
		padding: 0.5rem;
		background-color: oklch(1 0 0);
		border: 1px solid oklch(0.9 0 0);
	}

	/* Dark mode support */
	:global([data-theme="dark"] .speaker-dropdown),
	:global(.dark .speaker-dropdown) {
		background-color: oklch(0.25 0 0);
		border-color: oklch(0.35 0 0);
	}

	:global(.speaker-dropdown .dropdown-input) {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	:global(.speaker-dropdown .speaker-list) {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 200px;
		overflow-y: auto;
	}

	:global(.speaker-dropdown .speaker-list li) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		cursor: pointer;
		border-radius: 0.25rem;
	}

	:global(.speaker-dropdown .speaker-list li:hover) {
		background-color: oklch(0.95 0 0);
	}

	:global([data-theme="dark"] .speaker-dropdown .speaker-list li:hover),
	:global(.dark .speaker-dropdown .speaker-list li:hover) {
		background-color: oklch(0.3 0 0);
	}

	:global(.speaker-dropdown .speaker-list li.selected) {
		background-color: oklch(0.8 0.1 250 / 0.2);
		font-weight: 500;
	}

	:global(.speaker-dropdown .speaker-list li.highlighted) {
		background-color: oklch(0.9 0.05 250 / 0.3);
	}

	:global(.speaker-dropdown .hint) {
		margin-left: auto;
		font-size: 0.75rem;
		opacity: 0.5;
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		background-color: oklch(0.9 0 0);
	}

	:global([data-theme="dark"] .speaker-dropdown .hint),
	:global(.dark .speaker-dropdown .hint) {
		background-color: oklch(0.35 0 0);
	}

	:global(.speaker-dropdown .no-matches) {
		padding: 0.5rem;
		text-align: center;
		font-size: 0.875rem;
		opacity: 0.7;
	}

	:global(.speaker-dropdown .speaker-color) {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	:global(.speaker-dropdown .speaker-name) {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
