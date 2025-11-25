<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { SubtitleSegment } from './utils/types';

	// Props
	let {
		segments = [],
		currentSegmentIndex = -1,
		class: className = ''
	}: {
		segments?: SubtitleSegment[];
		currentSegmentIndex?: number;
		class?: string;
	} = $props();

	let containerElement: HTMLDivElement;

	function copyToClipboard() {
		const srtText = segments.map(s => s.srt).join('\n');
		navigator.clipboard.writeText(srtText);
	}

	function downloadSRT() {
		const srtText = segments.map(s => s.srt).join('\n');
		const blob = new Blob([srtText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `subtitles-${Date.now()}.srt`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="subtitle-preview {className}">
	<!-- Header -->
	<div class="preview-header">
		<h3 class="preview-title">{$_('dictate.subtitlePreview')} ({segments.length})</h3>
		<div class="preview-actions">
			<button
				class="action-button"
				onclick={copyToClipboard}
				disabled={segments.length === 0}
				title={$_('dictate.copy')}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
				</svg>
				{$_('dictate.copy')}
			</button>
			<button
				class="action-button"
				onclick={downloadSRT}
				disabled={segments.length === 0}
				title={$_('dictate.download')}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
				{$_('dictate.download')}
			</button>
		</div>
	</div>

	<!-- Segments -->
	<div class="segments-container" bind:this={containerElement}>
		{#if segments.length === 0}
			<div class="empty-state">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M3 7v6h6" />
					<path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
					<path d="M2 20l2-2 2 2" />
				</svg>
				<p>{$_('dictate.noSubtitlesYet')}</p>
				<p class="hint">{$_('dictate.approveWordsToGenerateSubtitles')}</p>
			</div>
		{:else}
			{#each segments as segment (segment.index)}
				<div
					class="segment"
					class:active={segment.index === currentSegmentIndex}
				>
					<div class="segment-text">{segment.text}</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.subtitle-preview {
		display: flex;
		flex-direction: column;
		height: 100%;
		background-color: oklch(var(--b2));
		border: 1px solid oklch(var(--b3));
		border-radius: 8px;
		overflow: hidden;
	}

	.preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		background-color: oklch(var(--b1));
		border-bottom: 1px solid oklch(var(--b3));
	}

	.preview-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: oklch(var(--bc));
	}

	.preview-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.action-button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid oklch(var(--b3));
		border-radius: 6px;
		background-color: oklch(var(--b1));
		cursor: pointer;
		font-size: 13px;
		color: oklch(var(--bc));
		transition: all 0.2s ease;
	}

	.action-button:hover:not(:disabled) {
		background-color: oklch(var(--b2));
		border-color: oklch(var(--bc) / 0.3);
	}

	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.segments-container {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: oklch(var(--bc) / 0.5);
		text-align: center;
	}

	.empty-state svg {
		margin-bottom: 16px;
		opacity: 0.5;
	}

	.empty-state p {
		margin: 4px 0;
	}

	.hint {
		font-size: 13px;
		color: oklch(var(--bc) / 0.4);
	}

	.segment {
		margin-bottom: 16px;
		padding: 12px;
		background-color: oklch(var(--b1));
		border: 1px solid oklch(var(--b3));
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.segment.active {
		border-color: oklch(var(--p));
		box-shadow: 0 2px 8px oklch(var(--p) / 0.2);
	}

	.segment-text {
		font-size: 14px;
		line-height: 1.5;
		color: oklch(var(--bc));
	}

	/* Scrollbar styling */
	.segments-container::-webkit-scrollbar {
		width: 8px;
	}

	.segments-container::-webkit-scrollbar-track {
		background-color: oklch(var(--b2));
	}

	.segments-container::-webkit-scrollbar-thumb {
		background-color: oklch(var(--bc) / 0.3);
		border-radius: 4px;
	}

	.segments-container::-webkit-scrollbar-thumb:hover {
		background-color: oklch(var(--bc) / 0.5);
	}
</style>
