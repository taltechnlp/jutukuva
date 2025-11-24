<script lang="ts">
	import type { DisplaySettings } from '$lib/types/display-settings';

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
	}> = [
		{ label: 'Regular', value: 400 },
		{ label: 'Semi-bold', value: 600 }
	];

	const colorPresets = [
		{ label: 'White / Black', textColor: '#FFFFFF', backgroundColor: '#000000' },
		{ label: 'Yellow / Black', textColor: '#F8E71C', backgroundColor: '#000000' },
		{ label: 'Cyan / Dark', textColor: '#50E3C2', backgroundColor: '#0B0B0B' },
		{
			label: 'Amber / Charcoal',
			textColor: '#FFB347',
			backgroundColor: '#1A1A1A'
		},
		{
			label: 'Blue / Graphite',
			textColor: '#E0F0FF',
			backgroundColor: '#0F1216'
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
		<span class="drawer-title">Settings</span>
		<button type="button" onclick={onClose} aria-label="Close settings"> ✕ </button>
	</div>

	<div class="drawer-body">
		<section class="drawer-section">
			<h2 class="section-title">Typography</h2>
			<div class="control-group">
				<label class="slider-control" for="font-size-slider">
					<div>
						Font Size
						<span class="value-chip">{settings.fontSize}px</span>
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
				</label>

				<div class="stack" role="group" aria-label="Font weight">
					{#each fontWeightOptions as option (option.value)}
						<button
							type="button"
							class="preset-chip {settings.fontWeight === option.value ? 'active' : ''}"
							aria-pressed={settings.fontWeight === option.value}
							onclick={() => handleSettingChange('fontWeight', option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		</section>

		<section class="drawer-section">
			<h2 class="section-title">Colors</h2>
			<div class="stack" role="group" aria-label="Color pickers">
				<label
					class="color-swatch active"
					style="background-color: {settings.textColor};"
					aria-label="Text color picker"
				>
					<input
						type="color"
						value={settings.textColor}
						oninput={(event) => handleSettingChange('textColor', event.currentTarget.value)}
					/>
					<span class="sr-only">Choose text color</span>
				</label>
				<label
					class="color-swatch active"
					style="background-color: {settings.backgroundColor};"
					aria-label="Background color picker"
				>
					<input
						type="color"
						value={settings.backgroundColor}
						oninput={(event) =>
							handleSettingChange('backgroundColor', event.currentTarget.value)}
					/>
					<span class="sr-only">Choose background color</span>
				</label>
			</div>

			<div class="stack" role="group" aria-label="Color presets">
				{#each colorPresets as preset (preset.label)}
					<button
						type="button"
						class="preset-chip"
						onclick={() => handlePresetApply(preset.textColor, preset.backgroundColor)}
					>
						{preset.label}
					</button>
				{/each}
			</div>
		</section>

		<section class="drawer-section">

			<h2 class="section-title">Horizontal Alignment</h2>
			<div class="control-group">
				<div class="stack" role="group" aria-label="Horizontal alignment">
					<button
						type="button"
						class="preset-chip {settings.horizontalAlignment === 'full' ? 'active' : ''}"
						aria-pressed={settings.horizontalAlignment === 'full'}
						onclick={() => handleSettingChange('horizontalAlignment', 'full')}
					>
						Full
					</button>
					<button
						type="button"
						class="preset-chip {settings.horizontalAlignment === 'left' ? 'active' : ''}"
						aria-pressed={settings.horizontalAlignment === 'left'}
						onclick={() => handleSettingChange('horizontalAlignment', 'left')}
					>
						Left
					</button>
					<button
						type="button"
						class="preset-chip {settings.horizontalAlignment === 'middle' ? 'active' : ''}"
						aria-pressed={settings.horizontalAlignment === 'middle'}
						onclick={() => handleSettingChange('horizontalAlignment', 'middle')}
					>
						Middle
					</button>
					<button
						type="button"
						class="preset-chip {settings.horizontalAlignment === 'right' ? 'active' : ''}"
						aria-pressed={settings.horizontalAlignment === 'right'}
						onclick={() => handleSettingChange('horizontalAlignment', 'right')}
					>
						Right
					</button>
				</div>
			</div>
		</section>

		<section class="drawer-section">
			<h2 class="section-title">View Mode</h2>
			<div class="stack" role="group" aria-label="View mode">
				<button
					type="button"
					class="preset-chip {settings.viewMode === 'text' ? 'active' : ''}"
					aria-pressed={settings.viewMode === 'text'}
					onclick={() => handleSettingChange('viewMode', 'text')}
				>
					Text
				</button>
				<button
					type="button"
					class="preset-chip {settings.viewMode === 'captions' ? 'active' : ''}"
					aria-pressed={settings.viewMode === 'captions'}
					onclick={() => handleSettingChange('viewMode', 'captions')}
				>
					Captions
				</button>
			</div>
		</section>

		{#if onReset}
			<button type="button" class="reset-button" onclick={onReset}> Reset to default </button>
		{/if}
	</div>
</div>
