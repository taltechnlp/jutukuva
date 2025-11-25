<script lang="ts">
	import type { DisplaySettings } from '$lib/types/display-settings';

	interface Props {
		text: string;
		settings: DisplaySettings;
		lastUpdated: number | null;
		placeholder?: string;
	}

	let {
		text,
		settings,
		lastUpdated,
		placeholder = 'Waiting for transcription…',
	}: Props = $props();

	const displayText = $derived.by(() => {
		const trimmed = text.trim();
		if (!trimmed) return placeholder;
		
		if (settings.viewMode === 'captions') {
			// Show only the last 3 lines
			const lines = trimmed.split('\n');
			if (lines.length <= 3) return trimmed;
			return lines.slice(-3).join('\n');
		}
		
		return trimmed;
	});

	const shellStyle = $derived(
		`color: ${settings.textColor}; ` +
			`font-size: ${settings.fontSize}px; ` +
			`font-weight: ${settings.fontWeight}; ` +
			`letter-spacing: ${settings.letterSpacing}em;`
	);
</script>

<section
	class="subtitle-shell {settings.horizontalAlignment === 'full' ? 'full' : ''}"
	style={shellStyle}
	aria-live="polite"
>
	<p class="subtitle-text">
		{displayText}
	</p>
</section>
