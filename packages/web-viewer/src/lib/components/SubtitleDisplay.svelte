<script lang="ts">
	import { tick } from 'svelte';
	import type { DisplaySettings } from '$lib/types/display-settings';

	interface Props {
		text: string;
		settings: DisplaySettings;
		lastUpdated: number | null;
		placeholder?: string;
		variant?: 'fullscreen' | 'overlay';
		autoscrollEnabled?: boolean;
	}

	let {
		text,
		settings,
		lastUpdated,
		placeholder = 'Waiting for transcription…',
		variant = 'fullscreen',
		autoscrollEnabled = false
	}: Props = $props();

	let containerElement: HTMLElement | null = $state(null);

	const displayText = $derived(text.trim() || placeholder);

	// Autoscroll when text changes and autoscroll is enabled
	$effect(() => {
		if (autoscrollEnabled && text && variant === 'fullscreen') {
			text; // Track text changes
			tick().then(() => {
				window.scrollTo({
					top: document.documentElement.scrollHeight,
					behavior: 'smooth'
				});
			});
		}
	});

	const shellStyle = $derived(
		`color: ${settings.textColor}; ` +
			`font-size: ${settings.fontSize}px; ` +
			`font-weight: ${settings.fontWeight}; ` +
			`background-color: ${variant === 'overlay' ? `rgba(0, 0, 0, ${settings.overlayOpacity})` : settings.backgroundColor}; ` +
			`letter-spacing: ${settings.letterSpacing}em; ` +
			`opacity: ${variant === 'overlay' ? settings.overlayOpacity : 1};`
	);

	function formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
</script>

<section
	bind:this={containerElement}
	class="subtitle-shell {variant === 'overlay' ? 'overlay' : ''}"
	style={shellStyle}
	aria-live="polite"
>
	<p class="subtitle-text">
		{displayText}
	</p>
	{#if lastUpdated}
		<span class="subtitle-meta" aria-live="off">
			Updated {formatTimestamp(lastUpdated)}
		</span>
	{:else}
		<span class="subtitle-meta" aria-live="off"> Ready for real-time subtitles </span>
	{/if}
</section>
