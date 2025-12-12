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

<div class="h-screen flex flex-col bg-[#0F0F0F] text-white overflow-hidden font-sans selection:bg-primary/30">
	<!-- Title Bar -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="flex items-center justify-between px-4 py-3 bg-[#0F0F0F] cursor-move select-none border-b border-white/5"
		onmousedown={startDragging}
	>
		<div class="flex items-center gap-2 transition-opacity duration-300" class:opacity-0={yjsStore.connected}>
			<div class="w-2 h-2 rounded-full bg-primary/80"></div>
			<span class="font-bold text-sm tracking-wide text-white/90">{$_('app.title')}</span>
		</div>
		<div class="flex items-center gap-1">
			<button 
				class="btn btn-ghost btn-xs btn-square text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all" 
				onclick={() => (settingsDrawerOpen = true)} 
				aria-label={$_('settings.title')}
				title={$_('settings.title')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.85 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
				</svg>
			</button>
			<WindowControls />
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex-1 flex flex-col relative overflow-hidden">
		<!-- Background Elements -->
		<div class="absolute inset-0 pointer-events-none overflow-hidden">
			<div class="absolute top-[-20%] right-[-10%] w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px]"></div>
			<div class="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-secondary/5 rounded-full blur-[80px]"></div>
		</div>

		<div class="relative z-10 flex-1 flex flex-col p-6">
			{#if !yjsStore.connected}
				<!-- Disconnected State: Centered Join Form -->
				<div class="flex-1 flex flex-col justify-center items-center -mt-10">
					<SessionJoin />
				</div>
			{:else}
				<!-- Connected State: Dashboard View -->
				<div class="flex flex-col h-full gap-6">
					<!-- Top: Status Bar -->
					<div class="w-full">
						<SessionJoin />
					</div>

					<!-- Middle: Preview Area -->
					<div class="flex-1 flex flex-col min-h-0 bg-white/5 rounded-2xl border border-white/5 relative overflow-hidden group">
						<div class="absolute top-3 left-4 text-xs font-semibold text-white/30 tracking-wider uppercase z-20 pointer-events-none">
							{$_('preview.title')}
						</div>
						
						<!-- Preview Content -->
						<div class="flex-1 overflow-hidden flex items-center justify-center p-4 relative">
							{#if captionStore.text}
								<div class="absolute inset-0 flex items-center justify-center p-6 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
									<CaptionDisplay
										text={settingsStore.settings.overlay.displayMode === 'lastOnly'
											? captionStore.lastParagraphs.slice(-1).join('\n')
											: captionStore.lastParagraphs.join('\n')}
										fontSettings={settingsStore.settings.font}
									/>
								</div>
							{:else}
								<div class="flex flex-col items-center gap-3 text-white/20">
									<span class="loading loading-dots loading-lg opacity-50"></span>
									<span class="text-xs uppercase tracking-widest">{$_('preview.waiting')}</span>
								</div>
							{/if}
						</div>

						<!-- Overlay Toggle overlaying the preview bottom -->
						<div class="absolute bottom-4 right-4 z-30">
							<button
								onclick={toggleOverlay}
								class="btn btn-sm gap-2 shadow-lg transition-all duration-300 border-none {overlayVisible ? 'bg-secondary hover:bg-secondary/80 text-white' : 'bg-primary hover:bg-primary/80 text-white'}"
							>
								<div class="w-2 h-2 rounded-full {overlayVisible ? 'bg-white animate-pulse' : 'bg-white/50'}"></div>
								{overlayVisible ? $_('preview.hide_overlay') : $_('preview.show_overlay')}
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
	
	<SettingsDrawer 
		open={settingsDrawerOpen} 
		settings={settingsStore.settings}
		onClose={() => (settingsDrawerOpen = false)}
		onChange={handleSettingsChange}
		onReset={() => settingsStore.reset()}
	/>

	<!-- Minimal Footer -->
	<div class="px-6 py-3 text-[10px] text-white/20 flex justify-between items-center bg-transparent relative z-10 w-full">
		<span class="uppercase tracking-wider">{$_('app.shortcut_hint')}</span>
		<span class="font-mono opacity-50">v{version}</span>
	</div>
</div>