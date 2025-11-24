<script lang="ts">
	import type { DisplaySettings } from '$lib/types/display-settings';
	import AlignmentIcons from './AlignmentIcons.svelte';

	interface Props {
		open: boolean;
		settings: DisplaySettings;
		onClose: () => void;
		onChange: (nextSettings: DisplaySettings) => void;
		onReset?: () => void;
	}

	let { open, settings, onClose, onChange, onReset }: Props = $props();

	const fontWeightOptions: Array<{
		label: string;
		value: DisplaySettings['fontWeight'];
		description: string;
	}> = [
		{ label: 'Regular', value: 400, description: 'Standard weight' },
		{ label: 'Semi-bold', value: 600, description: 'Enhanced visibility' }
	];

	const colorPresets = [
		{ label: 'Black on White', textColor: '#000000', backgroundColor: '#FFFFFF' },
		{ label: 'White on Black', textColor: '#FFFFFF', backgroundColor: '#000000' },
		{ label: 'Yellow on Black', textColor: '#F8E71C', backgroundColor: '#000000' },
		{ label: 'Cyan on Dark', textColor: '#50E3C2', backgroundColor: '#0B0B0B' },
		{
			label: 'Amber on Charcoal',
			textColor: '#FFB347',
			backgroundColor: '#1A1A1A'
		},
		{
			label: 'Blue on Graphite',
			textColor: '#E0F0FF',
			backgroundColor: '#0F1216'
		}
	];

	const alignmentOptions = [
		{ value: 'full' as const, description: 'Edge to edge' },
		{ value: 'left' as const, description: 'Left aligned' },
		{ value: 'middle' as const, description: 'Centered' },
		{ value: 'right' as const, description: 'Right aligned' }
	];

	const viewModeOptions = [
		{
			value: 'text' as const,
			label: 'Text',
			icon: '📄',
			description: 'Continuous scrolling text'
		},
		{
			value: 'captions' as const,
			label: 'Captions',
			icon: '💬',
			description: 'Subtitle-style display'
		}
	];

	function handleSettingChange<K extends keyof DisplaySettings>(
		key: K,
		value: DisplaySettings[K]
	) {
		onChange({ ...settings, [key]: value });
	}

	function handlePresetApply(textColor: string, backgroundColor: string) {
		onChange({ ...settings, textColor, backgroundColor });
	}
</script>

<div
	class="settings-drawer {open ? 'open' : ''}"
	role="dialog"
	aria-modal="true"
	aria-label="Settings panel"
>
	<div class="drawer-header">
		<div class="header-content">
			<span class="drawer-title">Display Settings</span>
			<span class="drawer-subtitle">Customize your viewing experience</span>
		</div>
		<button type="button" class="close-button" onclick={onClose} aria-label="Close settings">
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
						<span class="control-label">Font Size</span>
						<span class="value-badge">{settings.fontSize}px</span>
					</div>
					<input
						id="font-size-slider"
						type="range"
						min={48}
						max={96}
						step={2}
						value={settings.fontSize}
						oninput={(event) =>
							handleSettingChange('fontSize', Number(event.currentTarget.value))}
					/>
					<div class="slider-labels">
						<span>48px</span>
						<span>96px</span>
					</div>
				</label>

				<div class="control-subsection">
					<span class="control-label">Font Weight</span>
					<div class="button-group" role="group" aria-label="Font weight">
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
					<h2 class="section-title">Colors</h2>
					<p class="section-description">Choose your preferred color scheme</p>
				</div>
			</div>

			<div class="control-group">
				<div class="color-pickers">
					<label class="color-picker-item" aria-label="Text color picker">
						<span class="color-picker-label">Text</span>
						<div class="color-swatch" style="background-color: {settings.textColor};">
							<input
								type="color"
								value={settings.textColor}
								oninput={(event) => handleSettingChange('textColor', event.currentTarget.value)}
							/>
						</div>
						<span class="color-value">{settings.textColor}</span>
					</label>

					<label class="color-picker-item" aria-label="Background color picker">
						<span class="color-picker-label">Background</span>
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
					<span class="control-label">Presets</span>
					<div class="color-presets">
						{#each colorPresets as preset (preset.label)}
							<button
								type="button"
								class="color-preset-card"
								onclick={() => handlePresetApply(preset.textColor, preset.backgroundColor)}
								aria-label="Apply {preset.label} color scheme"
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
					<h2 class="section-title">Layout</h2>
					<p class="section-description">Configure text alignment and display mode</p>
				</div>
			</div>

			<div class="control-group">
				<div class="control-subsection">
					<span class="control-label">Horizontal Alignment</span>
					<div class="alignment-grid" role="group" aria-label="Horizontal alignment">
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

				<!-- <div class="control-subsection">
					<span class="control-label">View Mode</span>
					<div class="button-group" role="group" aria-label="View mode">
						{#each viewModeOptions as option (option.value)}
							<button
								type="button"
								class="option-button mode-button {settings.viewMode === option.value
									? 'active'
									: ''}"
								aria-pressed={settings.viewMode === option.value}
								onclick={() => handleSettingChange('viewMode', option.value)}
							>
								<span class="mode-icon">{option.icon}</span>
								<div class="mode-content">
									<span class="option-label">{option.label}</span>
									<span class="option-description">{option.description}</span>
								</div>
							</button>
						{/each}
					</div>
				</div> -->
			</div>
		</section>

		{#if onReset}
			<button type="button" class="reset-button" onclick={onReset}>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
					/>
				</svg>
				Reset to Defaults
			</button>
		{/if}
	</div>
</div>
