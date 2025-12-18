<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { Speaker } from '$lib/collaboration/types';
	import { clickOutside } from './utils/clickOutside';

	// Props
	let {
		onUndo = () => {},
		onRedo = () => {},
		speakers = [],
		onAddSpeaker,
		onRemoveSpeaker,
		onUpdateSpeaker
	}: {
		onUndo?: () => void;
		onRedo?: () => void;
		speakers?: Speaker[];
		onAddSpeaker?: (name: string) => Speaker;
		onRemoveSpeaker?: (id: string) => void;
		onUpdateSpeaker?: (id: string, name: string) => void;
	} = $props();

	// Speaker manager dropdown state
	let showSpeakerDropdown = $state(false);
	let newSpeakerName = $state('');
	let editingSpeakerId = $state<string | null>(null);
	let editingSpeakerName = $state('');

	// Help dropdown state
	let showHelpDropdown = $state(false);

	function toggleSpeakerDropdown() {
		showSpeakerDropdown = !showSpeakerDropdown;
		showHelpDropdown = false;
		if (!showSpeakerDropdown) {
			editingSpeakerId = null;
			editingSpeakerName = '';
		}
	}

	function closeSpeakerDropdown() {
		showSpeakerDropdown = false;
		editingSpeakerId = null;
		editingSpeakerName = '';
	}

	function toggleHelpDropdown() {
		showHelpDropdown = !showHelpDropdown;
		showSpeakerDropdown = false;
	}

	function closeHelpDropdown() {
		showHelpDropdown = false;
	}

	function handleAddSpeaker() {
		const trimmed = newSpeakerName.trim();
		if (trimmed && onAddSpeaker) {
			onAddSpeaker(trimmed);
			newSpeakerName = '';
		}
	}

	function handleAddSpeakerKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddSpeaker();
		}
	}

	function startEditingSpeaker(speaker: Speaker) {
		editingSpeakerId = speaker.id;
		editingSpeakerName = speaker.name;
	}

	function saveEditingSpeaker() {
		if (editingSpeakerId && editingSpeakerName.trim() && onUpdateSpeaker) {
			onUpdateSpeaker(editingSpeakerId, editingSpeakerName.trim());
		}
		editingSpeakerId = null;
		editingSpeakerName = '';
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveEditingSpeaker();
		} else if (e.key === 'Escape') {
			editingSpeakerId = null;
			editingSpeakerName = '';
		}
	}

	function handleRemoveSpeaker(id: string) {
		if (onRemoveSpeaker) {
			onRemoveSpeaker(id);
		}
	}
</script>

<div class="toolbar">
	<!-- Undo/Redo -->
	<div class="toolbar-group">
		<button
			class="toolbar-btn"
			onclick={onUndo}
			title={$_('dictate.toolbar.undoShortcut', { default: 'Undo (Ctrl+Z)' })}
			aria-label={$_('dictate.toolbar.undo', { default: 'Undo' })}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 7v6h6" />
				<path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
			</svg>
		</button>
		<button
			class="toolbar-btn"
			onclick={onRedo}
			title={$_('dictate.toolbar.redoShortcut', { default: 'Redo (Ctrl+Y)' })}
			aria-label={$_('dictate.toolbar.redo', { default: 'Redo' })}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 7v6h-6" />
				<path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
			</svg>
		</button>
	</div>

	<div class="toolbar-divider"></div>

	<!-- Speakers Manager -->
	<div class="toolbar-group relative">
		<button
			class="toolbar-btn"
			onclick={toggleSpeakerDropdown}
			title={$_('speakers.manageSpeakers', { default: 'Manage Speakers' })}
			aria-label={$_('speakers.manageSpeakers', { default: 'Manage Speakers' })}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
				<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
				<path d="M16 3.13a4 4 0 0 1 0 7.75" />
			</svg>
			{#if speakers.length > 0}
				<span class="speaker-count">{speakers.length}</span>
			{/if}
		</button>

		{#if showSpeakerDropdown}
			<div class="dropdown-panel" use:clickOutside={closeSpeakerDropdown}>
				<div class="dropdown-header">
					<h4>{$_('speakers.manageSpeakers', { default: 'Manage Speakers' })}</h4>
				</div>

				<!-- Add new speaker -->
				<div class="dropdown-input-row">
					<input
						type="text"
						bind:value={newSpeakerName}
						placeholder={$_('speakers.speakerName', { default: 'Speaker name' })}
						onkeydown={handleAddSpeakerKeydown}
						class="input input-sm input-bordered flex-1"
					/>
					<button
						type="button"
						class="btn btn-sm btn-primary"
						onclick={handleAddSpeaker}
						disabled={!newSpeakerName.trim()}
					>
						{$_('common.add', { default: 'Add' })}
					</button>
				</div>

				<!-- Speaker list -->
				<div class="dropdown-list">
					{#if speakers.length === 0}
						<div class="dropdown-empty">{$_('speakers.noSpeakers', { default: 'No speakers yet' })}</div>
					{:else}
						{#each speakers as speaker}
							<div class="speaker-row">
								<span class="speaker-color" style:background-color={speaker.color}></span>
								{#if editingSpeakerId === speaker.id}
									<input
										type="text"
										bind:value={editingSpeakerName}
										onkeydown={handleEditKeydown}
										onblur={saveEditingSpeaker}
										class="input input-xs input-bordered flex-1"
									/>
								{:else}
									<span class="speaker-name">{speaker.name}</span>
								{/if}
								<div class="speaker-actions">
									{#if editingSpeakerId !== speaker.id}
										<button
											type="button"
											class="action-btn"
											onclick={() => startEditingSpeaker(speaker)}
											title={$_('common.edit', { default: 'Edit' })}
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
												<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
											</svg>
										</button>
									{/if}
									<button
										type="button"
										class="action-btn action-btn-danger"
										onclick={() => handleRemoveSpeaker(speaker.id)}
										title={$_('common.delete', { default: 'Delete' })}
									>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<polyline points="3 6 5 6 21 6" />
											<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<div class="toolbar-divider"></div>

	<!-- Keyboard Shortcuts Help -->
	<div class="toolbar-group relative">
		<button
			class="toolbar-btn"
			onclick={toggleHelpDropdown}
			title={$_('dictate.shortcuts.title', { default: 'Keyboard Shortcuts' })}
			aria-label={$_('dictate.shortcuts.title', { default: 'Keyboard Shortcuts' })}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
		</button>

		{#if showHelpDropdown}
			<div class="dropdown-panel dropdown-panel-wide" use:clickOutside={closeHelpDropdown}>
				<div class="dropdown-header">
					<h4>{$_('dictate.shortcuts.title', { default: 'Keyboard Shortcuts' })}</h4>
				</div>
				<div class="shortcuts-grid">
					<div class="shortcut-row">
						<span class="shortcut-label">{$_('dictate.shortcuts.newParagraph', { default: 'New paragraph' })}</span>
						<kbd>Enter</kbd>
					</div>
					<div class="shortcut-row">
						<span class="shortcut-label">{$_('dictate.shortcuts.undo', { default: 'Undo' })}</span>
						<div class="shortcut-keys"><kbd>Ctrl</kbd><span>+</span><kbd>Z</kbd></div>
					</div>
					<div class="shortcut-row">
						<span class="shortcut-label">{$_('dictate.shortcuts.redo', { default: 'Redo' })}</span>
						<div class="shortcut-keys"><kbd>Ctrl</kbd><span>+</span><kbd>Y</kbd></div>
					</div>
					<div class="shortcut-row">
						<span class="shortcut-label">{$_('dictate.shortcuts.selectNextWord', { default: 'Next word' })}</span>
						<kbd>Tab</kbd>
					</div>
					<div class="shortcut-row">
						<span class="shortcut-label">{$_('dictate.shortcuts.selectPreviousWord', { default: 'Previous word' })}</span>
						<div class="shortcut-keys"><kbd>Shift</kbd><span>+</span><kbd>Tab</kbd></div>
					</div>
					<div class="shortcut-divider"></div>
					<div class="shortcut-row">
						<span class="shortcut-label">{$_('dictate.shortcuts.applySnippet', { default: 'Apply suggestion' })}</span>
						<kbd>Space</kbd>
					</div>
					<div class="shortcut-row">
						<span class="shortcut-label">{$_('dictate.shortcuts.cancelSnippet', { default: 'Dismiss suggestion' })}</span>
						<kbd>Esc</kbd>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background-color: var(--fallback-b2, oklch(var(--b2) / 1));
		border-bottom: 1px solid var(--fallback-b3, oklch(var(--b3) / 0.5));
	}

	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 4px;
		position: relative;
	}

	.toolbar-divider {
		width: 1px;
		height: 20px;
		background-color: var(--fallback-b3, oklch(var(--b3) / 0.5));
		margin: 0 4px;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		width: 34px;
		height: 34px;
		padding: 0;
		border: none;
		border-radius: 6px;
		background-color: transparent;
		cursor: pointer;
		color: var(--fallback-bc, oklch(var(--bc) / 0.7));
		transition: all 0.15s ease;
	}

	.toolbar-btn:hover {
		background-color: var(--fallback-b3, oklch(var(--b3) / 0.5));
		color: var(--fallback-bc, oklch(var(--bc) / 1));
	}

	.toolbar-btn:active {
		background-color: var(--fallback-b3, oklch(var(--b3) / 0.8));
	}

	.speaker-count {
		font-size: 10px;
		font-weight: 600;
		min-width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--fallback-p, oklch(var(--p) / 1));
		color: var(--fallback-pc, oklch(var(--pc) / 1));
		border-radius: 8px;
		position: absolute;
		top: -2px;
		right: -2px;
	}

	/* Dropdown Panel */
	.dropdown-panel {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 1000;
		min-width: 260px;
		background-color: var(--fallback-b1, oklch(var(--b1) / 1));
		border: 1px solid var(--fallback-b3, oklch(var(--b3) / 1));
		border-radius: 12px;
		box-shadow: 0 10px 40px -10px rgb(0 0 0 / 0.2), 0 4px 12px -4px rgb(0 0 0 / 0.1);
		margin-top: 8px;
		overflow: hidden;
	}

	.dropdown-panel-wide {
		min-width: 300px;
	}

	.dropdown-header {
		padding: 12px 16px;
		border-bottom: 1px solid var(--fallback-b3, oklch(var(--b3) / 0.5));
		background-color: var(--fallback-b2, oklch(var(--b2) / 0.3));
	}

	.dropdown-header h4 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--fallback-bc, oklch(var(--bc) / 0.8));
	}

	.dropdown-input-row {
		display: flex;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--fallback-b3, oklch(var(--b3) / 0.5));
	}

	.dropdown-list {
		max-height: 200px;
		overflow-y: auto;
	}

	.dropdown-empty {
		padding: 20px 16px;
		text-align: center;
		font-size: 13px;
		color: var(--fallback-bc, oklch(var(--bc) / 0.4));
	}

	/* Speaker Row */
	.speaker-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--fallback-b3, oklch(var(--b3) / 0.3));
		transition: background-color 0.1s;
	}

	.speaker-row:last-child {
		border-bottom: none;
	}

	.speaker-row:hover {
		background-color: var(--fallback-b2, oklch(var(--b2) / 0.5));
	}

	.speaker-color {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.speaker-name {
		flex: 1;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.speaker-actions {
		display: flex;
		gap: 4px;
		opacity: 0;
		transition: opacity 0.1s;
	}

	.speaker-row:hover .speaker-actions {
		opacity: 1;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: none;
		border-radius: 4px;
		background-color: transparent;
		cursor: pointer;
		color: var(--fallback-bc, oklch(var(--bc) / 0.5));
		transition: all 0.1s;
	}

	.action-btn:hover {
		background-color: var(--fallback-b3, oklch(var(--b3) / 0.5));
		color: var(--fallback-bc, oklch(var(--bc) / 1));
	}

	.action-btn-danger:hover {
		background-color: var(--fallback-er, oklch(var(--er) / 0.1));
		color: var(--fallback-er, oklch(var(--er) / 1));
	}

	/* Shortcuts */
	.shortcuts-grid {
		padding: 12px 16px;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 0;
	}

	.shortcut-label {
		font-size: 13px;
		color: var(--fallback-bc, oklch(var(--bc) / 0.7));
	}

	.shortcut-keys {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.shortcut-keys span {
		font-size: 11px;
		color: var(--fallback-bc, oklch(var(--bc) / 0.4));
	}

	.shortcut-divider {
		height: 1px;
		background-color: var(--fallback-b3, oklch(var(--b3) / 0.5));
		margin: 8px 0;
	}

	kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 22px;
		padding: 0 6px;
		font-family: inherit;
		font-size: 11px;
		font-weight: 500;
		color: var(--fallback-bc, oklch(var(--bc) / 0.8));
		background-color: var(--fallback-b2, oklch(var(--b2) / 1));
		border: 1px solid var(--fallback-b3, oklch(var(--b3) / 0.8));
		border-radius: 4px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
	}
</style>
