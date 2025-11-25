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

	function handleSelect(speaker: Speaker) {
		onSelect(speaker);
		onClose();
	}

	function handleAddNew() {
		const trimmed = newSpeakerName.trim();
		if (trimmed) {
			const newSpeaker = onAddSpeaker(trimmed);
			onSelect(newSpeaker);
			newSpeakerName = '';
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddNew();
		} else if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleOutclick() {
		onClose();
	}

	// Focus input when dropdown opens
	$effect(() => {
		if (isOpen && inputElement) {
			// Small delay to ensure element is visible
			setTimeout(() => inputElement?.focus(), 10);
		}
	});
</script>

{#if isOpen}
	<div class="speaker-dropdown" use:clickOutside onoutclick={handleOutclick}>
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

		<!-- Existing speakers list -->
		{#if speakers.length > 0}
			<ul class="speaker-list">
				{#each speakers as speaker}
					<li
						class="hover:bg-base-200"
						class:selected={speaker.id === selectedId}
						onclick={() => handleSelect(speaker)}
						onkeydown={(e) => e.key === 'Enter' && handleSelect(speaker)}
						role="option"
						aria-selected={speaker.id === selectedId}
						tabindex="0"
					>
						<span class="speaker-color" style:background-color={speaker.color}></span>
						<span class="speaker-name">{speaker.name}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.speaker-dropdown {
		position: absolute;
		z-index: 1000;
		border-radius: 0.5rem;
		box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.15);
		min-width: 220px;
		padding: 0.5rem;
		left: 0;
		top: 100%;
		margin-top: 4px;
	}

	/* Use :global to ensure Tailwind classes work with Svelte scoping */
	:global(.speaker-dropdown) {
		background-color: oklch(1 0 0);
		border: 1px solid oklch(0.9 0 0);
	}

	/* Dark mode support */
	:global([data-theme="dark"] .speaker-dropdown),
	:global(.dark .speaker-dropdown) {
		background-color: oklch(0.25 0 0);
		border-color: oklch(0.35 0 0);
	}

	.dropdown-input {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.speaker-list {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 200px;
		overflow-y: auto;
	}

	.speaker-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		cursor: pointer;
		border-radius: 0.25rem;
	}

	.speaker-list li.selected {
		background-color: oklch(0.8 0.1 250 / 0.2);
		font-weight: 500;
	}

	.speaker-color {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.speaker-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
