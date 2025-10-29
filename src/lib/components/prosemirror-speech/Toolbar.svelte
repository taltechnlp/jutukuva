<script lang="ts">
	import type { AutoConfirmConfig } from './utils/types';

	// Props
	let {
		wordCount = 0,
		approvedCount = 0,
		autoConfirmConfig = { enabled: true, timeoutSeconds: 5 },
		onUndo = () => {},
		onRedo = () => {},
		onAutoConfirmChange = (config: AutoConfirmConfig) => {}
	}: {
		wordCount?: number;
		approvedCount?: number;
		autoConfirmConfig?: AutoConfirmConfig;
		onUndo?: () => void;
		onRedo?: () => void;
		onAutoConfirmChange?: (config: AutoConfirmConfig) => void;
	} = $props();

	// Keyboard shortcuts modal state
	let showShortcutsModal = $state(false);

	function openShortcutsModal() {
		showShortcutsModal = true;
	}

	function closeShortcutsModal() {
		showShortcutsModal = false;
	}

	// Auto-confirm handlers
	function toggleAutoConfirm() {
		onAutoConfirmChange({
			...autoConfirmConfig,
			enabled: !autoConfirmConfig.enabled
		});
	}

	function handleTimeoutChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		onAutoConfirmChange({
			...autoConfirmConfig,
			timeoutSeconds: parseInt(target.value, 10)
		});
	}
</script>

<div class="toolbar">
	<!-- Undo/Redo -->
	<div class="toolbar-group">
		<button
			class="toolbar-button"
			onclick={onUndo}
			title="Undo (Ctrl+Z)"
			aria-label="Undo"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 7v6h6" />
				<path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
			</svg>
		</button>
		<button
			class="toolbar-button"
			onclick={onRedo}
			title="Redo (Ctrl+Shift+Z)"
			aria-label="Redo"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 7v6h-6" />
				<path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
			</svg>
		</button>
	</div>

	<!-- Auto-Confirm Settings -->
	<div class="toolbar-group auto-confirm-group">
		<label class="auto-confirm-toggle">
			<input
				type="checkbox"
				checked={autoConfirmConfig.enabled}
				onchange={toggleAutoConfirm}
				aria-label="Enable auto-confirm"
			/>
			<span>Auto-confirm</span>
		</label>
		{#if autoConfirmConfig.enabled}
			<select
				class="timeout-select"
				value={autoConfirmConfig.timeoutSeconds || 5}
				onchange={handleTimeoutChange}
				title="Auto-confirm timeout"
				aria-label="Auto-confirm timeout"
			>
				<option value={5}>5s</option>
				<option value={7}>7s</option>
				<option value={10}>10s</option>
				<option value={12}>12s</option>
				<option value={15}>15s</option>
			</select>
		{/if}
	</div>

	<!-- Progress -->
	<div class="toolbar-group progress-group">
		<div class="progress-bar">
			<div
				class="progress-fill"
				style:width={wordCount > 0 ? `${(approvedCount / wordCount) * 100}%` : '0%'}
			></div>
		</div>
		<span class="progress-text">{Math.round((approvedCount / wordCount) * 100) || 0}%</span>
	</div>

	<!-- Keyboard Shortcuts Help -->
	<div class="toolbar-group">
		<button
			class="toolbar-button"
			onclick={openShortcutsModal}
			title="Keyboard shortcuts"
			aria-label="Keyboard shortcuts"
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
			<h3 class="text-lg font-bold mb-4">Keyboard Shortcuts</h3>

			<div class="overflow-x-auto">
				<table class="table">
					<thead>
						<tr>
							<th>Action</th>
							<th>Shortcut</th>
						</tr>
					</thead>
					<tbody>
						<!-- Navigation -->
						<tr class="bg-base-200">
							<td colspan="2" class="font-semibold">Navigation</td>
						</tr>
						<tr>
							<td>Navigate to next word</td>
							<td>
								<kbd class="kbd kbd-sm">Tab</kbd> or <kbd class="kbd kbd-sm">→</kbd>
							</td>
						</tr>
						<tr>
							<td>Navigate to previous word</td>
							<td>
								<kbd class="kbd kbd-sm">Shift</kbd> + <kbd class="kbd kbd-sm">Tab</kbd> or <kbd class="kbd kbd-sm">←</kbd>
							</td>
						</tr>

						<!-- Approval -->
						<tr class="bg-base-200">
							<td colspan="2" class="font-semibold">Approval</td>
						</tr>
						<tr>
							<td>Approve all words up to current word</td>
							<td>
								<kbd class="kbd kbd-sm">Enter</kbd>
							</td>
						</tr>

						<!-- Editing -->
						<tr class="bg-base-200">
							<td colspan="2" class="font-semibold">Editing</td>
						</tr>
						<tr>
							<td>Undo</td>
							<td>
								<kbd class="kbd kbd-sm">Ctrl</kbd> + <kbd class="kbd kbd-sm">Z</kbd>
							</td>
						</tr>
						<tr>
							<td>Redo</td>
							<td>
								<kbd class="kbd kbd-sm">Ctrl</kbd> + <kbd class="kbd kbd-sm">Y</kbd> or
								<kbd class="kbd kbd-sm">Ctrl</kbd> + <kbd class="kbd kbd-sm">Shift</kbd> + <kbd class="kbd kbd-sm">Z</kbd>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div class="modal-action">
				<button class="btn" onclick={closeShortcutsModal}>Close</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop" onclick={closeShortcutsModal}>
			<button type="button">close</button>
		</form>
	</dialog>
{/if}

<style>
	.toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
		padding: 12px 16px;
		background-color: #fafafa;
		border-bottom: 1px solid #ddd;
	}

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
		border: 1px solid #ddd;
		border-radius: 6px;
		background-color: white;
		cursor: pointer;
		color: #424242;
		transition: all 0.2s ease;
	}

	.toolbar-button:hover {
		background-color: #f5f5f5;
		border-color: #bbb;
	}

	.toolbar-button:active {
		background-color: #e0e0e0;
	}

	.progress-group {
		flex: 1;
		max-width: 150px;
		min-width: 100px;
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		background-color: #e0e0e0;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #4caf50 0%, #8bc34a 100%);
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: 12px;
		font-weight: 600;
		color: #666;
		min-width: 40px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.auto-confirm-group {
		border-left: 1px solid #ddd;
		padding-left: 12px;
	}

	.auto-confirm-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #666;
		cursor: pointer;
		user-select: none;
	}

	.auto-confirm-toggle input {
		cursor: pointer;
	}

	.timeout-select {
		padding: 4px 8px;
		border: 1px solid #ddd;
		border-radius: 4px;
		background-color: white;
		font-size: 12px;
		color: #424242;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.timeout-select:hover {
		background-color: #f5f5f5;
		border-color: #bbb;
	}

	.timeout-select:focus {
		outline: none;
		border-color: #2196f3;
	}
</style>
