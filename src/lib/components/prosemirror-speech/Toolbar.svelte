<script lang="ts">
	import { _ } from 'svelte-i18n';

	// Props
	let {
		onUndo = () => {},
		onRedo = () => {}
	}: {
		onUndo?: () => void;
		onRedo?: () => void;
	} = $props();

	// Keyboard shortcuts modal state
	let showShortcutsModal = $state(false);

	function openShortcutsModal() {
		showShortcutsModal = true;
	}

	function closeShortcutsModal() {
		showShortcutsModal = false;
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
</style>
