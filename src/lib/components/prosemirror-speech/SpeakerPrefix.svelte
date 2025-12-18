<script lang="ts">
	import { _ } from 'svelte-i18n';
	import SpeakerDropdown from './SpeakerDropdown.svelte';
	import type { Speaker } from '$lib/collaboration/types';
	import type { Writable } from 'svelte/store';

	let {
		speakerIdStore,
		speakerNameStore,
		speakerColorStore,
		speakersStore,
		showDropdownStore,
		readOnly = false,
		onSelect,
		onAddSpeaker,
		onDropdownToggle
	}: {
		speakerIdStore: Writable<string | null>;
		speakerNameStore: Writable<string>;
		speakerColorStore: Writable<string>;
		speakersStore: Writable<Speaker[]>;
		showDropdownStore: Writable<boolean>;
		readOnly: boolean;
		onSelect: (speaker: Speaker | null) => void;
		onAddSpeaker: (name: string) => Speaker;
		onDropdownToggle: (show: boolean) => void;
	} = $props();

	// Subscribe to stores
	const speakerId = $derived($speakerIdStore);
	const speakerName = $derived($speakerNameStore);
	const speakerColor = $derived($speakerColorStore);
	const speakers = $derived($speakersStore);
	const showDropdown = $derived($showDropdownStore);

	function handlePrefixClick(e: MouseEvent) {
		if (readOnly) return;
		e.preventDefault();
		e.stopPropagation();
		onDropdownToggle(!showDropdown);
	}

	function handlePrefixKeydown(e: KeyboardEvent) {
		if (readOnly) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onDropdownToggle(!showDropdown);
		}
	}

	function handleSelect(speaker: Speaker) {
		onSelect(speaker);
	}

	function handleClose() {
		onDropdownToggle(false);
	}

	// If speaker is set, show the prefix
	const hasSpeaker = $derived(speakerId && speakerName);
</script>

<span class="speaker-prefix-container" contenteditable="false">
	{#if hasSpeaker}
		<!-- Speaker is assigned - show name with colon -->
		<span
			class="speaker-prefix"
			style:--speaker-color={speakerColor}
			onclick={handlePrefixClick}
			onkeydown={handlePrefixKeydown}
			role="button"
			tabindex={readOnly ? -1 : 0}
			aria-label={$_('speakers.changeSpeaker')}
		>
			<span class="speaker-color-dot" style:background-color={speakerColor}></span>
			<span class="speaker-name-text">{speakerName}</span>
			<span class="speaker-colon">:</span>
		</span>
	{:else if !readOnly}
		<!-- No speaker assigned - show placeholder that opens dropdown -->
		<span
			class="speaker-prefix speaker-prefix-empty"
			onclick={handlePrefixClick}
			onkeydown={handlePrefixKeydown}
			role="button"
			tabindex="0"
			aria-label={$_('speakers.selectSpeaker')}
		>
			<span class="speaker-placeholder">{$_('speakers.selectSpeaker')}</span>
		</span>
	{/if}

	{#if !readOnly}
		<SpeakerDropdown
			{speakers}
			selectedId={speakerId}
			isOpen={showDropdown}
			{onSelect}
			{onAddSpeaker}
			onClose={handleClose}
		/>
	{/if}
</span>

<style>
	.speaker-prefix-container {
		position: relative;
		display: inline-block;
		user-select: none;
		width: 120px;
		min-width: 120px;
		flex-shrink: 0;
	}

	.speaker-prefix {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		cursor: pointer;
		/* Avoid pushing the prefix text below the paragraph's first line */
		padding: 0 4px;
		border-radius: 4px;
		max-width: 100%;
		box-sizing: border-box;
		line-height: inherit;
	}

	.speaker-prefix:hover {
		background-color: var(--fallback-b2, oklch(var(--b2) / 1));
	}

	.speaker-prefix:focus {
		outline: 2px solid var(--fallback-p, oklch(var(--p) / 1));
		outline-offset: 1px;
	}

	.speaker-prefix-empty {
		opacity: 0.5;
	}

	.speaker-prefix-empty:hover {
		opacity: 1;
	}

	.speaker-color-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.speaker-name-text {
		font-weight: 600;
		color: var(--fallback-p, oklch(var(--p) / 1));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 80px;
	}

	.speaker-colon {
		color: var(--fallback-bc, oklch(var(--bc) / 0.6));
		margin-left: -2px;
	}

	.speaker-placeholder {
		font-style: italic;
		color: var(--fallback-bc, oklch(var(--bc) / 0.4));
		font-size: 0.9em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
