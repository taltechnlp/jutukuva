<script lang="ts">
	import type { FontSettings } from '$lib/types/settings';

	interface Props {
		text: string;
		fontSettings: FontSettings;
	}

	let { text, fontSettings }: Props = $props();

	function hexToRgba(hex: string, alpha: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
</script>

{#if text}
	<div
		class="caption-container"
		style="
			font-family: {fontSettings.family};
			font-size: {fontSettings.size}px;
			font-weight: {fontSettings.weight};
			color: {fontSettings.color};
			background-color: {hexToRgba(fontSettings.backgroundColor, fontSettings.backgroundOpacity)};
		"
	>
		{#each text.split('\n') as line}
			<p class="caption-line">{line}</p>
		{/each}
	</div>
{/if}

<style>
	.caption-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 12px 24px;
		border-radius: 8px;
		max-width: 100%;
	}

	.caption-line {
		text-align: center;
		margin: 0;
		padding: 2px 0;
		line-height: 1.3;
		word-wrap: break-word;
		max-width: 100%;
	}
</style>
