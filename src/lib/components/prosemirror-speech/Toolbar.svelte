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

	// Keyboard shortcuts modal state
	let showShortcutsModal = $state(false);

	// Speaker manager dropdown state
	let showSpeakerDropdown = $state(false);
	let newSpeakerName = $state('');
	let editingSpeakerId = $state<string | null>(null);
	let editingSpeakerName = $state('');

	function openShortcutsModal() {
		showShortcutsModal = true;
	}

	function closeShortcutsModal() {
		showShortcutsModal = false;
	}

	function toggleSpeakerDropdown() {
		showSpeakerDropdown = !showSpeakerDropdown;
		if (!showSpeakerDropdown) {
			// Reset state when closing
			editingSpeakerId = null;
			editingSpeakerName = '';
		}
	}

	function closeSpeakerDropdown() {
		showSpeakerDropdown = false;
		editingSpeakerId = null;
		editingSpeakerName = '';
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

<div class="flex items-center flex-wrap gap-3 px-4 py-3 bg-base-200 border-b border-base-300">
	<!-- Undo/Redo -->
	<div class="toolbar-group">
		<button
			class="toolbar-button"
			onclick={onUndo}
			title={$_('dictate.toolbar.undoShortcut')}
			aria-label={$_('dictate.toolbar.undo')}
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 7v6h6" />
				<path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
			</svg>
		</button>
		<button
			class="toolbar-button"
			onclick={onRedo}
			title={$_('dictate.toolbar.redoShortcut')}
			aria-label={$_('dictate.toolbar.redo')}
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 7v6h-6" />
				<path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
			</svg>
		</button>
	</div>

	<!-- Speakers Manager -->
	<div class="toolbar-group relative">
		<button
			class="toolbar-button"
			onclick={toggleSpeakerDropdown}
			title={$_('speakers.manageSpeakers')}
			aria-label={$_('speakers.manageSpeakers')}
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
				<circle cx="9" cy="7" r="4" />
				<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
				<path d="M16 3.13a4 4 0 0 1 0 7.75" />
			</svg>
		</button>

		{#if showSpeakerDropdown}
			<div class="speaker-manager-dropdown bg-base-100 border-base-300" use:clickOutside={closeSpeakerDropdown}>
				<div class="dropdown-header bg-base-100 border-base-300">
					<h4>{$_('speakers.manageSpeakers')}</h4>
				</div>

				<!-- Add new speaker -->
				<div class="add-speaker-form bg-base-100 border-base-300">
					<input
						type="text"
						bind:value={newSpeakerName}
						placeholder={$_('speakers.speakerName')}
						onkeydown={handleAddSpeakerKeydown}
						class="input input-sm input-bordered flex-1"
					/>
					<button
						type="button"
						class="btn btn-sm btn-primary"
						onclick={handleAddSpeaker}
						disabled={!newSpeakerName.trim()}
					>
						{$_('common.add')}
					</button>
				</div>

				<!-- Speaker list -->
				<div class="speaker-list bg-base-100">
					{#if speakers.length === 0}
						<div class="no-speakers bg-base-100">{$_('speakers.noSpeakers')}</div>
					{:else}
						{#each speakers as speaker}
							<div class="speaker-item bg-base-100 hover:bg-base-200">
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
											class="btn btn-ghost btn-xs"
											onclick={() => startEditingSpeaker(speaker)}
											title={$_('common.edit')}
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
												<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
											</svg>
										</button>
									{/if}
									<button
										type="button"
										class="btn btn-ghost btn-xs text-error"
										onclick={() => handleRemoveSpeaker(speaker.id)}
										title={$_('common.delete')}
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

	<!-- Keyboard Shortcuts Help -->
	<div class="toolbar-group">
		<button
			class="toolbar-button"
			onclick={openShortcutsModal}
			title={$_('dictate.shortcuts.title')}
			aria-label={$_('dictate.shortcuts.title')}
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="2" y="4" width="20" height="16" rx="2" />
				<path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
			</svg>
		</button>
	</div>
</div>

<!-- Keyboard Shortcuts Modal -->
{#if showShortcutsModal}
	<dialog class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="text-lg font-bold mb-4">{$_('dictate.shortcuts.title')}</h3>

			<div class="overflow-x-auto">
				<table class="table">
					<thead>
						<tr>
							<th>{$_('dictate.shortcuts.action')}</th>
							<th>{$_('dictate.shortcuts.shortcut')}</th>
						</tr>
					</thead>
					<tbody>
						<!-- Editing -->
						<tr class="bg-base-200">
							<td colspan="2" class="font-semibold">{$_('dictate.shortcuts.editing')}</td>
						</tr>
						<tr>
							<td>{$_('dictate.shortcuts.newParagraph', { default: 'Create new paragraph' })}</td>
							<td>
								<kbd class="kbd kbd-sm">Enter</kbd>
							</td>
						</tr>
						<tr>
							<td>{$_('dictate.shortcuts.undo')}</td>
							<td>
								<kbd class="kbd kbd-sm">Ctrl</kbd> + <kbd class="kbd kbd-sm">Z</kbd>
							</td>
						</tr>
						<tr>
							<td>{$_('dictate.shortcuts.redo')}</td>
							<td>
								<kbd class="kbd kbd-sm">Ctrl</kbd> + <kbd class="kbd kbd-sm">Y</kbd> {$_('dictate.shortcuts.or')}
								<kbd class="kbd kbd-sm">Ctrl</kbd> + <kbd class="kbd kbd-sm">Shift</kbd> + <kbd class="kbd kbd-sm">Z</kbd>
							</td>
						</tr>
						<tr>
							<td>{$_('dictate.shortcuts.selectNextWord', { default: 'Select next word' })}</td>
							<td>
								<kbd class="kbd kbd-sm">Tab</kbd>
							</td>
						</tr>
						<tr>
							<td>{$_('dictate.shortcuts.selectPreviousWord', { default: 'Select previous word' })}</td>
							<td>
								<kbd class="kbd kbd-sm">Shift</kbd> + <kbd class="kbd kbd-sm">Tab</kbd>
							</td>
						</tr>

						<!-- Text Snippets -->
						<tr class="bg-base-200">
							<td colspan="2" class="font-semibold">{$_('dictate.shortcuts.textSnippets', { default: 'Text Snippets' })}</td>
						</tr>
						<tr>
							<td>{$_('dictate.shortcuts.applySnippet', { default: 'Apply snippet (when ghost text shown)' })}</td>
							<td>
								<kbd class="kbd kbd-sm">Space</kbd>
							</td>
						</tr>
						<tr>
							<td>{$_('dictate.shortcuts.cancelSnippet', { default: 'Cancel snippet and insert space' })}</td>
							<td>
								<kbd class="kbd kbd-sm">Esc</kbd>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div class="modal-action">
				<button class="btn" onclick={closeShortcutsModal}>{$_('dictate.shortcuts.close')}</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop" onclick={closeShortcutsModal}>
			<button type="button">close</button>
		</form>
	</dialog>
{/if}

<style>
	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.toolbar-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid var(--fallback-b3, oklch(var(--b3) / 1));
		border-radius: 6px;
		background-color: var(--fallback-b1, oklch(var(--b1) / 1));
		cursor: pointer;
		color: var(--fallback-bc, oklch(var(--bc) / 1));
		transition: all 0.2s ease;
	}

	.toolbar-button:hover {
		background-color: var(--fallback-b2, oklch(var(--b2) / 1));
		border-color: var(--fallback-bc, oklch(var(--bc) / 0.3));
	}

	.toolbar-button:active {
		background-color: var(--fallback-b3, oklch(var(--b3) / 1));
	}

	/* Speaker Manager Dropdown */
	.speaker-manager-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 1000;
		min-width: 280px;
		border-width: 1px;
		border-style: solid;
		border-radius: 0.5rem;
		box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.15);
		margin-top: 4px;
	}

	.dropdown-header {
		padding: 0.75rem 1rem;
		border-bottom-width: 1px;
		border-bottom-style: solid;
	}

	.dropdown-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.add-speaker-form {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom-width: 1px;
		border-bottom-style: solid;
	}

	.speaker-list {
		max-height: 240px;
		overflow-y: auto;
	}

	.no-speakers {
		padding: 1rem;
		text-align: center;
		opacity: 0.5;
		font-size: 0.875rem;
	}

	.speaker-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid oklch(0.95 0 0 / 0.5);
	}

	.speaker-item:last-child {
		border-bottom: none;
	}

	.speaker-color {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.speaker-name {
		flex: 1;
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.speaker-actions {
		display: flex;
		gap: 2px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.speaker-item:hover .speaker-actions {
		opacity: 1;
	}
</style>
