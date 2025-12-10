<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { _ } from 'svelte-i18n';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { captionStore } from '$lib/stores/caption.svelte';

	const fontFamilies = [
		{ value: 'Inter, system-ui, sans-serif', label: 'Inter (Vaikimisi)' },
		{ value: 'Arial, sans-serif', label: 'Arial' },
		{ value: 'Helvetica, sans-serif', label: 'Helvetica' },
		{ value: 'Georgia, serif', label: 'Georgia' },
		{ value: 'Verdana, sans-serif', label: 'Verdana' },
		{ value: 'Roboto, sans-serif', label: 'Roboto' },
		{ value: 'monospace', label: 'Monospace' }
	];

	async function updateFontFamily(e: Event) {
		const target = e.target as HTMLSelectElement;
		await settingsStore.updateFont({ family: target.value });
	}

	async function updateFontSize(e: Event) {
		const target = e.target as HTMLInputElement;
		await settingsStore.updateFont({ size: parseInt(target.value) });
	}

	async function updateFontWeight(e: Event) {
		const target = e.target as HTMLInputElement;
		await settingsStore.updateFont({ weight: parseInt(target.value) });
	}

	async function updateFontColor(e: Event) {
		const target = e.target as HTMLInputElement;
		await settingsStore.updateFont({ color: target.value });
	}

	async function updateBackgroundColor(e: Event) {
		const target = e.target as HTMLInputElement;
		await settingsStore.updateFont({ backgroundColor: target.value });
	}

	async function updateBackgroundOpacity(e: Event) {
		const target = e.target as HTMLInputElement;
		await settingsStore.updateFont({ backgroundOpacity: parseFloat(target.value) });
	}

	async function updatePositionPreset(e: Event) {
		const target = e.target as HTMLSelectElement;
		await settingsStore.updateOverlay({ positionPreset: target.value });

		// Apply preset position
		if (target.value !== 'custom') {
			const screenWidth = window.screen.width;
			const screenHeight = window.screen.height;
			const size = settingsStore.settings.overlay.size;

			let x = (screenWidth - size.width) / 2;
			let y: number;

			switch (target.value) {
				case 'top':
					y = 50;
					break;
				case 'center':
					y = (screenHeight - size.height) / 2;
					break;
				case 'bottom':
				default:
					y = screenHeight - size.height - 100;
			}

			await invoke('set_overlay_position', { x: Math.round(x), y: Math.round(y) });
			await settingsStore.updateOverlay({
				position: { x: Math.round(x), y: Math.round(y) }
			});
		}
	}

	async function updateOverlayWidth(e: Event) {
		const target = e.target as HTMLInputElement;
		const width = parseInt(target.value);
		await settingsStore.updateOverlay({
			size: { ...settingsStore.settings.overlay.size, width }
		});
		await invoke('set_overlay_size', { width, height: settingsStore.settings.overlay.size.height });
	}

	async function updateOverlayHeight(e: Event) {
		const target = e.target as HTMLInputElement;
		const height = parseInt(target.value);
		await settingsStore.updateOverlay({
			size: { ...settingsStore.settings.overlay.size, height }
		});
		await invoke('set_overlay_size', { width: settingsStore.settings.overlay.size.width, height });
	}

	async function updateClickThrough(e: Event) {
		const target = e.target as HTMLInputElement;
		await settingsStore.updateOverlay({ clickThrough: target.checked });
		await invoke('set_click_through', { enabled: target.checked });
	}

	function updateDisplayMode(mode: 'lastOnly' | 'multiLine') {
		captionStore.setDisplayMode(mode);
	}
</script>

<div class="card bg-base-200 shadow-lg">
	<div class="card-body p-4">
		<h2 class="card-title text-sm">{$_('settings.title')}</h2>

		<!-- Overlay Settings -->
		<div class="collapse collapse-arrow bg-base-100">
			<input type="checkbox" checked />
			<div class="collapse-title font-medium text-sm">{$_('settings.overlay.title')}</div>
			<div class="collapse-content">
				<div class="space-y-3">
					<!-- Position Preset -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.overlay.position')}</span>
						</label>
						<select
							class="select select-bordered select-sm w-full"
							value={settingsStore.settings.overlay.positionPreset}
							onchange={updatePositionPreset}
						>
							<option value="top">{$_('settings.overlay.position_top')}</option>
							<option value="center">{$_('settings.overlay.position_center')}</option>
							<option value="bottom">{$_('settings.overlay.position_bottom')}</option>
							<option value="custom">{$_('settings.overlay.position_custom')}</option>
						</select>
					</div>

					<!-- Width -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.overlay.width')}: {settingsStore.settings.overlay.size.width}px</span>
						</label>
						<input
							type="range"
							min="400"
							max="1920"
							step="10"
							value={settingsStore.settings.overlay.size.width}
							onchange={updateOverlayWidth}
							class="range range-xs range-primary"
						/>
					</div>

					<!-- Height -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.overlay.height')}: {settingsStore.settings.overlay.size.height}px</span>
						</label>
						<input
							type="range"
							min="60"
							max="400"
							step="10"
							value={settingsStore.settings.overlay.size.height}
							onchange={updateOverlayHeight}
							class="range range-xs range-primary"
						/>
					</div>

					<!-- Click Through -->
					<div class="form-control">
						<label class="label cursor-pointer py-1">
							<span class="label-text text-xs">{$_('settings.overlay.click_through')}</span>
							<input
								type="checkbox"
								checked={settingsStore.settings.overlay.clickThrough}
								onchange={updateClickThrough}
								class="toggle toggle-sm toggle-primary"
							/>
						</label>
					</div>

					<!-- Display Mode -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.overlay.display_mode')}</span>
						</label>
						<div class="btn-group">
							<button
								class="btn btn-xs"
								class:btn-active={captionStore.displayMode === 'lastOnly'}
								onclick={() => updateDisplayMode('lastOnly')}
							>
								{$_('settings.overlay.last_line')}
							</button>
							<button
								class="btn btn-xs"
								class:btn-active={captionStore.displayMode === 'multiLine'}
								onclick={() => updateDisplayMode('multiLine')}
							>
								{$_('settings.overlay.multi_line')}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Font Settings -->
		<div class="collapse collapse-arrow bg-base-100">
			<input type="checkbox" />
			<div class="collapse-title font-medium text-sm">{$_('settings.font.title')}</div>
			<div class="collapse-content">
				<div class="space-y-3">
					<!-- Font Family -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.font.family')}</span>
						</label>
						<select
							class="select select-bordered select-sm w-full"
							value={settingsStore.settings.font.family}
							onchange={updateFontFamily}
						>
							{#each fontFamilies as font}
								<option value={font.value}>{font.label}</option>
							{/each}
						</select>
					</div>

					<!-- Font Size -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.font.size')}: {settingsStore.settings.font.size}px</span>
						</label>
						<input
							type="range"
							min="16"
							max="72"
							step="2"
							value={settingsStore.settings.font.size}
							onchange={updateFontSize}
							class="range range-xs range-primary"
						/>
					</div>

					<!-- Font Weight -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.font.weight')}: {settingsStore.settings.font.weight}</span>
						</label>
						<input
							type="range"
							min="300"
							max="700"
							step="100"
							value={settingsStore.settings.font.weight}
							onchange={updateFontWeight}
							class="range range-xs range-primary"
						/>
					</div>

					<!-- Text Color -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.font.text_color')}</span>
						</label>
						<input
							type="color"
							value={settingsStore.settings.font.color}
							onchange={updateFontColor}
							class="w-full h-8 rounded cursor-pointer"
						/>
					</div>

					<!-- Background Color -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.font.background_color')}</span>
						</label>
						<input
							type="color"
							value={settingsStore.settings.font.backgroundColor}
							onchange={updateBackgroundColor}
							class="w-full h-8 rounded cursor-pointer"
						/>
					</div>

					<!-- Background Opacity -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text text-xs">{$_('settings.font.background_opacity')}: {Math.round(settingsStore.settings.font.backgroundOpacity * 100)}%</span>
						</label>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={settingsStore.settings.font.backgroundOpacity}
							onchange={updateBackgroundOpacity}
							class="range range-xs range-primary"
						/>
					</div>
				</div>
			</div>
		</div>

		<!-- Preview -->
		<div class="mt-2 p-3 rounded-lg" style="background-color: {settingsStore.settings.font.backgroundColor}; opacity: {settingsStore.settings.font.backgroundOpacity};">
			<p
				style="
					font-family: {settingsStore.settings.font.family};
					font-size: {Math.min(settingsStore.settings.font.size, 24)}px;
					font-weight: {settingsStore.settings.font.weight};
					color: {settingsStore.settings.font.color};
				"
			>
				{$_('settings.preview_text')}
			</p>
		</div>
	</div>
</div>
