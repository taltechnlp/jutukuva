<script lang="ts">
	import { _ } from 'svelte-i18n';
	import SpeechEditor from './SpeechEditor.svelte';
	import type { CollaborationManager } from '$lib/collaboration/CollaborationManager';

	// Props
	let {
		collaborationManager = undefined,
		class: className = ''
	}: {
		collaborationManager?: CollaborationManager;
		class?: string;
	} = $props();
</script>

<div class="readonly-editor-preview {className}">
	<!-- Header -->
	<div class="preview-header">
		<h3 class="preview-title">{$_('dictate.readOnlyPreview', { default: 'Read-Only Preview' })}</h3>
	</div>

	<!-- Read-Only Editor -->
	<div class="editor-container">
		{#if collaborationManager}
			<SpeechEditor
				{collaborationManager}
				readOnly={true}
				config={{
					fontSize: 16
				}}
			/>
		{:else}
			<div class="empty-state">
				<p>{$_('dictate.noCollaboration', { default: 'No collaboration session active' })}</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.readonly-editor-preview {
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

	.editor-container {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
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

	.empty-state p {
		margin: 4px 0;
	}
</style>
