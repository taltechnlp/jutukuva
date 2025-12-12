<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { _ } from 'svelte-i18n';
	import WindowControls from '$lib/components/WindowControls.svelte';
	import SessionJoin from '$lib/components/SessionJoin.svelte';
	import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
	import CaptionDisplay from '$lib/components/CaptionDisplay.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { yjsStore } from '$lib/stores/yjs.svelte';
	import { captionStore } from '$lib/stores/caption.svelte'; // broadcasts via Rust backend
	import { version } from '../../package.json';

	let overlayVisible = $state(false);
	let settingsDrawerOpen = $state(false);

	let cleanup: (() => void) | null = null;

	onMount(() => {
		// Initialize async operations
		(async () => {
			// Load settings
			await settingsStore.load();

			// Check initial overlay state
			try {
				overlayVisible = await invoke<boolean>('get_overlay_visible');
			} catch (e) {
				console.error('Failed to get overlay state:', e);
			}

			// Listen for overlay toggle global shortcut
			const unlistenToggle = await listen('toggle-overlay', async () => {
				try {
					overlayVisible = await invoke<boolean>('toggle_overlay');
				} catch (e) {
					console.error('Failed to toggle overlay:', e);
				}
			});

			// Listen for open-settings event from overlay
			const unlistenOpenSettings = await listen('open-settings', () => {
				settingsDrawerOpen = true;
			});

			cleanup = () => {
				unlistenToggle();
				unlistenOpenSettings();
			};
		})();

		return () => {
			cleanup?.();
		};
	});

	async function toggleOverlay() {
		try {
			overlayVisible = await invoke<boolean>('toggle_overlay');
		} catch (e) {
			console.error('Failed to toggle overlay:', e);
		}
	}

	async function startDragging() {
		const window = await getCurrentWindow();
		await window.startDragging();
	}

	async function handleSettingsChange(newSettings: import('$lib/types/settings').AppSettings) {
		if (newSettings.overlay.displayMode !== settingsStore.settings.overlay.displayMode) {
			captionStore.setDisplayMode(newSettings.overlay.displayMode);
		}
		
		// Apply click-through immediately if it changed
		if (newSettings.overlay.clickThrough !== settingsStore.settings.overlay.clickThrough) {
			try {
				await invoke('set_click_through', { enabled: newSettings.overlay.clickThrough });
			} catch (e) {
				console.error('Failed to set click-through:', e);
			}
		}
		
		settingsStore.save(newSettings);
	}
</script>

<div class="h-screen flex flex-col bg-base-100 rounded-lg overflow-hidden">
	<!-- Title Bar -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="flex items-center justify-between px-4 py-2 bg-base-200 cursor-move select-none"
		onmousedown={startDragging}
	>
		<div class="flex items-center gap-2">
			<span class="font-semibold text-sm">{$_('app.title')}</span>
			{#if yjsStore.connected}
				<span class="badge badge-success badge-xs"></span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<button class="btn btn-ghost btn-xs btn-square" onclick={() => (settingsDrawerOpen = true)} aria-label={$_('settings.title')}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.85 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
				</svg>
			</button>
			<WindowControls />
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto p-4 space-y-4">
		<!-- Session Join -->
		<SessionJoin />

		<!-- Caption Preview -->
		{#if yjsStore.connected}
			<div class="card bg-base-200 shadow-lg">
				<div class="card-body p-4">
					<div class="flex items-center justify-between">
						<h2 class="card-title text-sm">{$_('preview.title')}</h2>
						<button
							onclick={toggleOverlay}
							class="btn btn-sm"
							class:btn-primary={!overlayVisible}
							class:btn-secondary={overlayVisible}
						>
							{overlayVisible ? $_('preview.hide_overlay') : $_('preview.show_overlay')}
						</button>
					</div>
					<div class="mt-2 flex justify-center">
						<CaptionDisplay
							text={settingsStore.settings.overlay.displayMode === 'lastOnly'
								? captionStore.lastParagraphs.slice(-1).join('\n')
								: captionStore.lastParagraphs.join('\n')}
							fontSettings={settingsStore.settings.font}
						/>
					</div>
					{#if !captionStore.text}
						<p class="text-center text-base-content/50 text-sm mt-2">
							{$_('preview.waiting')}
						</p>
					{/if}
				</div>
			</div>
		{/if}

	</div>
	
	<SettingsDrawer 
		open={settingsDrawerOpen} 
		settings={settingsStore.settings}
		onClose={() => (settingsDrawerOpen = false)}
		onChange={handleSettingsChange}
		onReset={() => settingsStore.reset()}
	/>

	<!-- Footer -->
	<div class="px-4 py-2 bg-base-200 text-xs text-base-content/50 flex justify-between items-center">
		<span>{$_('app.shortcut_hint')}</span>
		<span>v{version}</span>
	</div>
</div>