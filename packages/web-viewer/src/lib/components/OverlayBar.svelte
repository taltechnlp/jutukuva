<script lang="ts">
	import SubtitleDisplay from './SubtitleDisplay.svelte';
	import type { DisplaySettings } from '$lib/types/display-settings';

	interface Props {
		text: string;
		settings: DisplaySettings;
		lastUpdated: number | null;
		minimized: boolean;
		onToggleMinimize: () => void;
		onOpenSettings: () => void;
	}

	let {
		text,
		settings,
		lastUpdated,
		minimized,
		onToggleMinimize,
		onOpenSettings
	}: Props = $props();
</script>

<div
	class="overlay-shell {minimized ? 'minimized' : ''}"
	style="background-color: rgba(0, 0, 0, {settings.overlayOpacity});"
>
	<div class="overlay-controls">
		<button type="button" onclick={onToggleMinimize}>
			{minimized ? 'Expand subtitles' : 'Minimize'}
		</button>
		<button type="button" onclick={onOpenSettings}> Settings </button>
	</div>
	{#if minimized}
		<span aria-live="polite">Live subtitles hidden — expand to view</span>
	{:else}
		<SubtitleDisplay
			{text}
			{settings}
			{lastUpdated}
			variant="overlay"
		/>
	{/if}
</div>
