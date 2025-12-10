<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { _ } from 'svelte-i18n';
	import WindowControls from '$lib/components/WindowControls.svelte';
	import SessionJoin from '$lib/components/SessionJoin.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import CaptionDisplay from '$lib/components/CaptionDisplay.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { yjsStore } from '$lib/stores/yjs.svelte';
	import { captionStore } from '$lib/stores/caption.svelte'; // broadcasts via Rust backend
	import { version } from '../../package.json';

	let overlayVisible = $state(false);

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

			cleanup = () => {
				unlistenToggle();
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
		<WindowControls />
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
							text={captionStore.displayMode === 'lastOnly'
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

		<!-- Settings Panel -->
		<SettingsPanel />
	</div>

	<!-- Footer -->
	<div class="px-4 py-2 bg-base-200 text-xs text-base-content/50 flex justify-between items-center">
		<span>{$_('app.shortcut_hint')}</span>
		<span>v{version}</span>
	</div>
</div>
