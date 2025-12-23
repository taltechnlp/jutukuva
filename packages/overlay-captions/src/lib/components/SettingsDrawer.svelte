<script lang="ts">
	import { browser } from '$app/environment';
	import { invoke } from '@tauri-apps/api/core';
	import { _ } from 'svelte-i18n';
	import type { AppSettings, FontSettings, OverlaySettings } from '$lib/types/settings';
	import AlignmentIcons from './AlignmentIcons.svelte';

	interface Props {
		open: boolean;
		settings: AppSettings;
		onClose: () => void;
		onChange: (nextSettings: AppSettings) => void;
		onReset?: () => void;
	}

	let { open, settings, onClose, onChange, onReset }: Props = $props();

	// Detect mobile device using media query
	let isMobile = $state(false);

	$effect(() => {
		if (!browser) return;

		const checkMobile = () => {
			isMobile = window.matchMedia('(max-width: 768px)').matches;
		};

		checkMobile();
		const mediaQuery = window.matchMedia('(max-width: 768px)');
		mediaQuery.addEventListener('change', checkMobile);

		return () => mediaQuery.removeEventListener('change', checkMobile);
	});

	const fontSizeMin = $derived(isMobile ? 12 : 16);
	const fontSizeMax = $derived(isMobile ? 72 : 96);
	const fontSizeStep = $derived(isMobile ? 2 : 2);

	const fontWeightOptions = $derived([
		{ label: $_('settings.font_weight_regular'), value: 400, description: $_('settings.font_weight_regular_desc') },
		{ label: $_('settings.font_weight_semibold'), value: 600, description: $_('settings.font_weight_semibold_desc') }
	]);

	const colorPresets = $derived([
		{ label: $_('settings.preset_black_on_white'), color: '#000000', backgroundColor: '#FFFFFF' },
		{ label: $_('settings.preset_white_on_black'), color: '#FFFFFF', backgroundColor: '#000000' },
		{ label: $_('settings.preset_yellow_on_black'), color: '#F8E71C', backgroundColor: '#000000' },
		{ label: $_('settings.preset_cyan_on_dark'), color: '#50E3C2', backgroundColor: '#0B0B0B' },
		{ label: $_('settings.preset_amber_on_charcoal'), color: '#FFB347', backgroundColor: '#1A1A1A' },
		{ label: $_('settings.preset_blue_on_graphite'), color: '#E0F0FF', backgroundColor: '#0F1216' }
	]);

	const alignmentOptions = $derived([
		{ value: 'justify' as const, iconType: 'full' as const, description: $_('settings.align_full') },
		{ value: 'left' as const, iconType: 'left' as const, description: $_('settings.align_left') },
		{ value: 'center' as const, iconType: 'middle' as const, description: $_('settings.align_middle') },
		{ value: 'right' as const, iconType: 'right' as const, description: $_('settings.align_right') }
	]);

	function handleFontChange<K extends keyof FontSettings>(
		key: K,
		value: FontSettings[K]
	) {
		onChange({ ...settings, font: { ...settings.font, [key]: value } });
	}

    function handleOverlayChange<K extends keyof OverlaySettings>(
		key: K,
		value: OverlaySettings[K]
	) {
		onChange({ ...settings, overlay: { ...settings.overlay, [key]: value } });
	}

	function handlePresetApply(color: string, backgroundColor: string) {
		onChange({
            ...settings,
            font: {
                ...settings.font,
                color,
            },
			overlay: {
				...settings.overlay,
				backgroundColor,
			}
        });
	}

    async function handleResetPosition() {
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const size = settings.overlay.size;

        const x = Math.round((screenWidth - size.width) / 2);
        const y = Math.round(screenHeight - size.height - 100);

        await invoke('set_overlay_position', { x, y });
        handleOverlayChange('position', { x, y });
    }

	function handleBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}
</script>



{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="drawer-backdrop"
		onclick={onClose}
		onkeydown={handleBackdropKeydown}
		tabindex="-1"
		aria-hidden="true"
	></div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="settings-drawer open"
		role="dialog"
		aria-modal="true"
		aria-label={$_('settings.title')}
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
	<div class="drawer-header">
		<div class="header-content">
			<span class="drawer-title">{$_('settings.title')}</span>
			<span class="drawer-subtitle">{$_('settings.subtitle')}</span>
		</div>
		<button type="button" class="close-button" onclick={onClose} aria-label={$_('settings.close')}>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
				/>
			</svg>
		</button>
	</div>

	<div class="drawer-body">
		<!-- Typography Section -->
		<section class="drawer-section">
			<div class="control-group">
				<label class="slider-control" for="font-size-slider">
					<div class="slider-header">
						<span class="control-label">{$_('settings.font_size')}</span>
						<span class="value-badge">{settings.font.size}px</span>
					</div>
					<input
						id="font-size-slider"
						type="range"
						min={fontSizeMin}
						max={fontSizeMax}
						step={fontSizeStep}
						value={settings.font.size}
						oninput={(event) =>
							handleFontChange('size', Number(event.currentTarget.value))}
					/>
					<div class="slider-labels">
						<span>{fontSizeMin}px</span>
						<span>{fontSizeMax}px</span>
					</div>
				</label>

				<label class="slider-control" for="line-height-slider">
					<div class="slider-header">
						<span class="control-label">{$_('settings.line_height')}</span>
						<span class="value-badge">{settings.font.lineHeight.toFixed(2)}</span>
					</div>
					<input
						id="line-height-slider"
						type="range"
						min="0.8"
						max="2.5"
						step="0.1"
						value={settings.font.lineHeight}
						oninput={(event) =>
							handleFontChange('lineHeight', Number(event.currentTarget.value))}
					/>
					<div class="slider-labels">
						<span>0.8</span>
						<span>2.5</span>
					</div>
				</label>

				<div class="control-subsection">
					<span class="control-label">{$_('settings.font_weight')}</span>
					<div class="button-group" role="group" aria-label={$_('settings.font_weight')}>
						{#each fontWeightOptions as option (option.value)}
							<button
								type="button"
								class="option-button {settings.font.weight === option.value ? 'active' : ''}"
								aria-pressed={settings.font.weight === option.value}
								onclick={() => handleFontChange('weight', option.value)}
							>
								<span class="option-label">{option.label}</span>
								<span class="option-description">{option.description}</span>
							</button>
						{/each}
					</div>
				</div>


			</div>
		</section>

		<div class="section-divider"></div>

		<!-- Colors Section -->
		<section class="drawer-section">
			<div class="section-header">
				<div class="section-icon">🎨</div>
				<div>
					<h2 class="section-title">{$_('settings.colors')}</h2>
					<p class="section-description">{$_('settings.colors_desc')}</p>
				</div>
			</div>

			<div class="control-group">
				<div class="color-pickers">
					<label class="color-picker-item" aria-label={$_('settings.text_color')}>
						<span class="color-picker-label">{$_('settings.text_color')}</span>
						<div class="color-swatch" style="background-color: {settings.font.color};">
							<input
								type="color"
								value={settings.font.color}
								oninput={(event) => handleFontChange('color', event.currentTarget.value)}
							/>
						</div>
						<span class="color-value">{settings.font.color}</span>
					</label>

					<label class="color-picker-item" aria-label={$_('settings.background_color')}>
						<span class="color-picker-label">{$_('settings.background_color')}</span>
						<div class="color-swatch" style="background-color: {settings.overlay.backgroundColor};">
							<input
								type="color"
								value={settings.overlay.backgroundColor}
								oninput={(event) =>
									handleOverlayChange('backgroundColor', event.currentTarget.value)}
							/>
						</div>
						<span class="color-value">{settings.overlay.backgroundColor}</span>
					</label>
				</div>

                <!-- Background Opacity -->
                <label class="slider-control">
					<div class="slider-header">
						<span class="control-label">{$_('settings.overlay.opacity')}</span>
						<span class="value-badge">{Math.round(settings.overlay.opacity * 100)}%</span>
					</div>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={settings.overlay.opacity}
						oninput={(event) =>
							handleOverlayChange('opacity', Number(event.currentTarget.value))}
					/>
				</label>

				<div class="control-subsection">
					<span class="control-label">{$_('settings.presets')}</span>
					<div class="color-presets">
						{#each colorPresets as preset (preset.label)}
							<button
								type="button"
								class="color-preset-card"
								onclick={() => handlePresetApply(preset.color, preset.backgroundColor)}
								aria-label={preset.label}
							>
								<div
									class="preset-preview"
									style="background-color: {preset.backgroundColor}; color: {preset.color};"
								>
									<span class="preset-preview-text">Aa</span>
								</div>
								<span class="preset-label">{preset.label}</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<div class="section-divider"></div>

		<!-- Layout Section -->
		<section class="drawer-section">
			<div class="section-header">
				<div class="section-icon">⚙️</div>
				<div>
					<h2 class="section-title">{$_('settings.layout')}</h2>
					<p class="section-description">{$_('settings.layout_desc')}</p>
				</div>
			</div>

			<div class="control-group">
				<div class="control-subsection">
					<span class="control-label">{$_('settings.horizontal_alignment')}</span>
					<div class="alignment-grid" role="group" aria-label={$_('settings.horizontal_alignment')}>
						{#each alignmentOptions as option (option.value)}
							<button
								type="button"
								class="alignment-button {settings.font.align === option.value
									? 'active'
									: ''}"
								aria-pressed={settings.font.align === option.value}
								onclick={() => handleFontChange('align', option.value)}
							>
								<span class="alignment-icon">
									<AlignmentIcons type={option.iconType} />
								</span>
								<span class="alignment-description">{option.description}</span>
							</button>
						{/each}
					</div>
				</div>
                
                <div class="control-subsection">
					<span class="control-label">{$_('settings.overlay.title')}</span>
                    
                    <!-- Display Mode -->
                    <!-- <div class="flex flex-col gap-2">
                         <span class="text-sm text-white/60">{$_('settings.overlay.display_mode')}</span>
                         <div class="grid grid-cols-2 gap-2">
                             <button 
                                class="option-button {settings.overlay.displayMode === 'lastOnly' ? 'active' : ''}"
                                onclick={() => handleOverlayChange('displayMode', 'lastOnly')}
                             >
                                <span class="option-label">{$_('settings.overlay.last_line')}</span>
                             </button>
                             <button
                                class="option-button {settings.overlay.displayMode === 'multiLine' ? 'active' : ''}"
                                onclick={() => handleOverlayChange('displayMode', 'multiLine')}
                             >
                                <span class="option-label">{$_('settings.overlay.multi_line')}</span>
                             </button>
                         </div>
                    </div> -->

                    <!-- Click Through -->
                     <label class="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors border border-white/10">
                         <span class="text-sm font-medium text-white/80">{$_('settings.overlay.click_through')}</span>
                         <input 
                            type="checkbox" 
                            checked={settings.overlay.clickThrough}
                            onchange={(e) => handleOverlayChange('clickThrough', e.currentTarget.checked)}
                            class="toggle toggle-sm toggle-primary"
                         />
                     </label>

                     <button 
                        class="option-button w-full flex-row justify-center"
                        onclick={handleResetPosition}
                     >
                         <span class="option-label">{$_('settings.overlay.reset_position')}</span>
                     </button>

                </div>

			</div>
		</section>

		{#if onReset}
			<button type="button" class="reset-button" onclick={onReset}>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
					/>
				</svg>
				{$_('settings.reset')}
			</button>
		{/if}
	</div>
</div>
{/if}

<style>
	/* Drawer Container */
	.settings-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		max-width: 380px;
		background: #111111;
		color: #ffffff;
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
		transform: translateX(100%);
		transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
		z-index: 50;
		display: flex;
		flex-direction: column;
		border-left: 1px solid rgba(255, 255, 255, 0.1);
	}

	.settings-drawer.open {
		transform: translateX(0);
	}

	.drawer-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(2px);
		z-index: 40;
		animation: fadeIn 0.3s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Header */
	.drawer-header {
		padding: 24px;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: #111111;
	}

	.header-content {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.drawer-title {
		font-size: 24px;
		font-weight: 700;
		line-height: 1.2;
		color: #ffffff;
	}

	.drawer-subtitle {
		font-size: 14px;
		color: rgba(255, 255, 255, 0.6);
	}

	.close-button {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		padding: 8px;
		margin: -8px;
		border-radius: 50%;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.close-button svg {
		width: 24px;
		height: 24px;
	}

	/* Body */
	.drawer-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	/* Scrollbar styling */
	.drawer-body::-webkit-scrollbar {
		width: 8px;
	}

	.drawer-body::-webkit-scrollbar-track {
		background: transparent;
	}

	.drawer-body::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
	}

	.drawer-body::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	/* Sections */
	.drawer-section {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.section-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0 -24px;
	}

	.section-header {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		margin-bottom: 8px;
	}

	.section-icon {
		font-size: 24px;
		line-height: 1;
	}

	.section-title {
		font-size: 18px;
		font-weight: 600;
		color: #ffffff;
		margin: 0 0 4px 0;
	}

	.section-description {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.6);
		margin: 0;
		line-height: 1.4;
	}

	/* Controls */
	.control-group {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.control-subsection {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.control-label {
		font-size: 14px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Slider */
	.slider-control {
		display: flex;
		flex-direction: column;
		gap: 12px;
		cursor: pointer;
	}

	.slider-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.value-badge {
		background: rgba(255, 255, 255, 0.1);
		padding: 4px 12px;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 600;
		color: #818cf8;
		font-family: monospace;
	}

	input[type='range'] {
		-webkit-appearance: none;
		width: 100%;
		height: 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		outline: none;
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		background: #818cf8;
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid #111;
		transition: transform 0.1s ease;
	}

	input[type='range']::-webkit-slider-thumb:hover {
		transform: scale(1.1);
		background: #a5b4fc;
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.4);
	}

	/* Option Buttons (Font Weight) */
	.button-group {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.option-button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		text-align: center;
	}

    .option-button.flex-row {
        flex-direction: row;
    }

	.option-button:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.option-button.active {
		background: rgba(129, 140, 248, 0.2);
		border-color: #818cf8;
	}

	.option-label {
		font-size: 14px;
		font-weight: 600;
		color: #ffffff;
	}

	.option-description {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.5);
	}

	.option-button.active .option-label {
		color: #818cf8;
	}

	.option-button.active .option-description {
		color: rgba(129, 140, 248, 0.8);
	}

	/* Color Pickers */
	.color-pickers {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.color-picker-item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		cursor: pointer;
	}

	.color-picker-label {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
	}

	.color-swatch {
		height: 48px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		overflow: hidden;
		position: relative;
		transition: transform 0.2s ease;
	}

	.color-swatch:hover {
		transform: scale(1.02);
		border-color: rgba(255, 255, 255, 0.4);
	}

	input[type='color'] {
		position: absolute;
		top: -50%;
		left: -50%;
		width: 200%;
		height: 200%;
		cursor: pointer;
		opacity: 0;
	}

	.color-value {
		font-family: monospace;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.4);
		text-align: center;
	}

	/* Color Presets */
	.color-presets {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}

	.color-preset-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.color-preset-card:hover {
		background: rgba(255, 255, 255, 0.1);
		transform: translateY(-2px);
	}

	.preset-preview {
		width: 100%;
		aspect-ratio: 2/1;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(0, 0, 0, 0.1);
	}

	.preset-preview-text {
		font-weight: 700;
		font-size: 16px;
	}

	.preset-label {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
		line-height: 1.2;
	}

	/* Alignment Grid */
	.alignment-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}

	.alignment-button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 12px 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.alignment-button:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.alignment-button.active {
		background: rgba(129, 140, 248, 0.2);
		border-color: #818cf8;
	}

	.alignment-icon {
		color: rgba(255, 255, 255, 0.8);
	}

	.alignment-button.active .alignment-icon {
		color: #818cf8;
	}

	.alignment-description {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
	}

	.alignment-button.active .alignment-description {
		color: rgba(129, 140, 248, 0.8);
	}

	/* Reset Button */
	.reset-button {
		margin-top: auto;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.6);
		padding: 16px;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.reset-button:hover {
		background: rgba(255, 59, 48, 0.1);
		color: #ff3b30;
		border-color: rgba(255, 59, 48, 0.3);
	}

	.reset-button svg {
		width: 20px;
		height: 20px;
	}
</style>
