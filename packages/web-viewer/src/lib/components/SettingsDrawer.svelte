<script lang="ts">
	import { browser } from '$app/environment';
	import { _ } from 'svelte-i18n';
	import type { DisplaySettings } from '$lib/types/display-settings';
	import AlignmentIcons from './AlignmentIcons.svelte';
	import {
		fetchLatestRelease,
		getAssetForPlatform,
		type Platform
	} from '$lib/utils/overlay-download';

	interface Props {
		open: boolean;
		settings: DisplaySettings;
		onClose: () => void;
		onChange: (nextSettings: DisplaySettings) => void;
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

	const fontSizeMin = $derived(isMobile ? 10 : 18);
	const fontSizeMax = $derived(isMobile ? 72 : 96);
	const fontSizeStep = $derived(isMobile ? 2 : 2);

	const fontWeightOptions = $derived([
		{ label: $_('settings.font_weight_regular'), value: 400 as const, description: $_('settings.font_weight_regular_desc') },
		{ label: $_('settings.font_weight_semibold'), value: 600 as const, description: $_('settings.font_weight_semibold_desc') }
	]);

	const colorPresets = $derived([
		{ label: $_('settings.preset_black_on_white'), textColor: '#000000', backgroundColor: '#FFFFFF' },
		{ label: $_('settings.preset_white_on_black'), textColor: '#FFFFFF', backgroundColor: '#000000' },
		{ label: $_('settings.preset_yellow_on_black'), textColor: '#F8E71C', backgroundColor: '#000000' },
		{ label: $_('settings.preset_cyan_on_dark'), textColor: '#50E3C2', backgroundColor: '#0B0B0B' },
		{ label: $_('settings.preset_amber_on_charcoal'), textColor: '#FFB347', backgroundColor: '#1A1A1A' },
		{ label: $_('settings.preset_blue_on_graphite'), textColor: '#E0F0FF', backgroundColor: '#0F1216' }
	]);

	const alignmentOptions = $derived([
		{ value: 'full' as const, description: $_('settings.align_full') },
		{ value: 'left' as const, description: $_('settings.align_left') },
		{ value: 'middle' as const, description: $_('settings.align_middle') },
		{ value: 'right' as const, description: $_('settings.align_right') }
	]);

	function handleSettingChange<K extends keyof DisplaySettings>(
		key: K,
		value: DisplaySettings[K]
	) {
		onChange({ ...settings, [key]: value });
	}

	function handlePresetApply(textColor: string, backgroundColor: string) {
		onChange({ ...settings, textColor, backgroundColor });
	}

	function handleBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	// Download state
	let downloadLoading = $state(false);
	let downloadError = $state<string | null>(null);

	async function handleDownload(platform: Platform) {
		downloadLoading = true;
		downloadError = null;
		try {
			const release = await fetchLatestRelease();
			const asset = getAssetForPlatform(release.assets, platform);
			if (asset) {
				window.open(asset.browser_download_url, '_blank');
			} else {
				downloadError = $_('settings.download_error');
			}
		} catch {
			downloadError = $_('settings.download_error');
		} finally {
			downloadLoading = false;
		}
	}
</script>



{#if open}

	<div
		class="drawer-backdrop"
		onclick={onClose}
		onkeydown={handleBackdropKeydown}
		tabindex="-1"
		aria-hidden="true"
	></div>
{/if}

<div
	class="settings-drawer {open ? 'open' : ''}"
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
						<span class="value-badge">{settings.fontSize}px</span>
					</div>
					<input
						id="font-size-slider"
						type="range"
						min={fontSizeMin}
						max={fontSizeMax}
						step={fontSizeStep}
						value={settings.fontSize}
						oninput={(event) =>
							handleSettingChange('fontSize', Number(event.currentTarget.value))}
					/>
					<div class="slider-labels">
						<span>{fontSizeMin}px</span>
						<span>{fontSizeMax}px</span>
					</div>
				</label>

				<label class="slider-control" for="line-height-slider">
					<div class="slider-header">
						<span class="control-label">{$_('settings.line_height')}</span>
						<span class="value-badge">{settings.lineHeight.toFixed(2)}</span>
					</div>
					<input
						id="line-height-slider"
						type="range"
						min="0.8"
						max="2.5"
						step="0.1"
						value={settings.lineHeight}
						oninput={(event) =>
							handleSettingChange('lineHeight', Number(event.currentTarget.value))}
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
								class="option-button {settings.fontWeight === option.value ? 'active' : ''}"
								aria-pressed={settings.fontWeight === option.value}
								onclick={() => handleSettingChange('fontWeight', option.value)}
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
						<div class="color-swatch" style="background-color: {settings.textColor};">
							<input
								type="color"
								value={settings.textColor}
								oninput={(event) => handleSettingChange('textColor', event.currentTarget.value)}
							/>
						</div>
						<span class="color-value">{settings.textColor}</span>
					</label>

					<label class="color-picker-item" aria-label={$_('settings.background_color')}>
						<span class="color-picker-label">{$_('settings.background_color')}</span>
						<div class="color-swatch" style="background-color: {settings.backgroundColor};">
							<input
								type="color"
								value={settings.backgroundColor}
								oninput={(event) =>
									handleSettingChange('backgroundColor', event.currentTarget.value)}
							/>
						</div>
						<span class="color-value">{settings.backgroundColor}</span>
					</label>
				</div>

				<div class="control-subsection">
					<span class="control-label">{$_('settings.presets')}</span>
					<div class="color-presets">
						{#each colorPresets as preset (preset.label)}
							<button
								type="button"
								class="color-preset-card"
								onclick={() => handlePresetApply(preset.textColor, preset.backgroundColor)}
								aria-label={preset.label}
							>
								<div
									class="preset-preview"
									style="background-color: {preset.backgroundColor}; color: {preset.textColor};"
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
								class="alignment-button {settings.horizontalAlignment === option.value
									? 'active'
									: ''}"
								aria-pressed={settings.horizontalAlignment === option.value}
								onclick={() => handleSettingChange('horizontalAlignment', option.value)}
							>
								<span class="alignment-icon">
									<AlignmentIcons type={option.value} />
								</span>
								<span class="alignment-description">{option.description}</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<div class="section-divider"></div>

		<!-- Overlay Download Section -->
		<section class="drawer-section">
			<div class="section-header">
				<div class="section-icon">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
						<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
					</svg>
				</div>
				<div>
					<h2 class="section-title">{$_('settings.overlay_download')}</h2>
					<p class="section-description">{$_('settings.overlay_download_desc')}</p>
				</div>
			</div>

			<div class="control-group">
				<div class="download-buttons">
					<button
						type="button"
						class="download-button"
						onclick={() => handleDownload('windows')}
						disabled={downloadLoading}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="download-icon">
							<path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .15V5.21L20 3zM3 13l6 .1v6.35l-6-1.33V13zm7 .25l10 .15V21l-10-1.91v-5.84z"/>
						</svg>
						<span>{$_('settings.download_windows')}</span>
					</button>
					<button
						type="button"
						class="download-button"
						onclick={() => handleDownload('macos')}
						disabled={downloadLoading}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="download-icon">
							<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
						</svg>
						<span>{$_('settings.download_macos')}</span>
					</button>
					<button
						type="button"
						class="download-button"
						onclick={() => handleDownload('linux')}
						disabled={downloadLoading}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="download-icon">
							<path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.468v.023c.004.2.063.396.14.59.037.09.08.133.127.198.017.02.036.04.05.065a.65.65 0 01-.067.016.67.67 0 01-.144.023.595.595 0 01-.251-.074.936.936 0 01-.236-.187.725.725 0 01-.2-.287 1.547 1.547 0 01-.073-.498v-.02c0-.005.003-.01.003-.016 0-.267.063-.533.182-.736.12-.2.293-.4.503-.535a1.13 1.13 0 01.636-.2zm-2.539.598h.013c.107 0 .207.048.294.166.086.12.141.265.159.467v.04a1.6 1.6 0 01-.064.532.86.86 0 01-.2.333.9.9 0 01-.09.065c-.104.04-.2.063-.282.132a1.378 1.378 0 00-.203.066.502.502 0 00.178-.2c.053-.127.083-.264.088-.398v-.02a1.223 1.223 0 00-.06-.4 1.21 1.21 0 00-.182-.333.64.64 0 00-.264-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.468v.023c.004.2.063.396.14.59.037.09.08.133.127.198.017.02.036.04.05.065a.648.648 0 01-.067.016.67.67 0 01-.144.023.595.595 0 01-.251-.074.936.936 0 01-.236-.187.752.752 0 01-.2-.286 1.5 1.5 0 01-.073-.479v-.02c0-.005.003-.01.003-.016 0-.267.063-.533.182-.736.12-.2.293-.4.503-.535.134-.067.282-.133.433-.133zm5.25 4.665c.103 0 .196.067.3.133.2.133.39.267.59.465.19.2.381.4.55.6.166.2.33.4.46.534.066.067.132.132.18.199.049.067.106.133.107.2.001.033-.028.064-.06.092v.003c-.032.027-.074.062-.083.108-.01.064.027.124.073.18.05.06.1.133.153.2.102.132.205.265.254.332.049.064.095.125.115.193 0 0 .05.332.038.464-.008.064-.027.132-.066.2-.04.064-.093.133-.178.198-.085.066-.197.133-.34.2-.283.132-.629.265-1.065.332-.282.04-.562.037-.84-.015-.139-.027-.27-.077-.394-.133-.124-.055-.242-.125-.351-.199-.11-.074-.205-.155-.304-.235a1.11 1.11 0 01-.24-.301c-.088-.168-.125-.369-.115-.567.01-.199.07-.404.166-.59.12-.232.3-.43.509-.59.208-.163.454-.286.699-.362a1.654 1.654 0 00-.247-.3 3.41 3.41 0 00-.277-.202h.005c-.13-.086-.248-.172-.35-.261-.1-.09-.188-.183-.261-.281a.784.784 0 01-.154-.34c-.033-.14 0-.281.098-.394.099-.117.24-.205.392-.261a1.88 1.88 0 01.477-.098h.016z"/>
						</svg>
						<span>{$_('settings.download_linux')}</span>
					</button>
				</div>
				{#if downloadError}
					<p class="download-error">{downloadError}</p>
				{/if}
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
