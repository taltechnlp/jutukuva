<script lang="ts">
	import type { FontSettings } from '$lib/types/settings';

	interface Props {
		text: string;
		fontSettings: FontSettings;
	}

	let { text, fontSettings }: Props = $props();
</script>

{#key `${text}-${fontSettings.family}-${fontSettings.size}-${fontSettings.weight}-${fontSettings.color}-${fontSettings.align}`}
	{#if text}
		<div
			class="caption-container"
			style:font-family={fontSettings.family}
			style:font-size="{fontSettings.size}px"
			style:font-weight={fontSettings.weight}
			style:color={fontSettings.color}
			style:text-align={fontSettings.align}
			style:align-items={fontSettings.align === 'left' ? 'flex-start' : fontSettings.align === 'right' ? 'flex-end' : fontSettings.align === 'justify' ? 'stretch' : 'center'}
		>
			{#each text.split('\n') as line, i (i)}
				<p class="caption-line">{line}</p>
			{/each}
		</div>
	{/if}
{/key}

<style>
	.caption-container {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 12px 24px;
		border-radius: 8px;
		max-width: 100%;
		position: relative;
		contain: layout style paint;
	}

	.caption-line {
		margin: 0;
		padding: 2px 0;
		line-height: 1.3;
		word-wrap: break-word;
		max-width: 100%;
		position: relative;
		text-rendering: optimizeLegibility;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}
</style>
