<script lang="ts">
	import { tick } from 'svelte';
	import type { DisplaySettings } from '$lib/types/display-settings';

	interface Props {
		text: string;
		settings: DisplaySettings;
		lastUpdated: number | null;
		prefersReducedMotion: boolean;
		placeholder?: string;
		variant?: 'fullscreen' | 'overlay';
	}

	let {
		text,
		settings,
		lastUpdated,
		prefersReducedMotion,
		placeholder = 'Waiting for transcription…',
		variant = 'fullscreen'
	}: Props = $props();

	let animate = $state(false);

	const displayText = $derived(text.trim() || placeholder);

	// Trigger animation when text changes
	$effect(() => {
		if (prefersReducedMotion) {
			return;
		}
		displayText; // Track dependency
		animate = true;
		setTimeout(() => {
			animate = false;
		}, 220);
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
	class="subtitle-shell {variant === 'overlay' ? 'overlay' : ''}"
	style={shellStyle}
	aria-live="polite"
>
	<p class="subtitle-text {animate && !prefersReducedMotion ? 'fade-in' : ''}">
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
