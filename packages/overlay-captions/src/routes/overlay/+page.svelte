<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { _ } from 'svelte-i18n';
	import CaptionDisplay from '$lib/components/CaptionDisplay.svelte';
	import type { AppSettings } from '$lib/types/settings';
	import { defaultSettings } from '$lib/types/settings';

	let settings = $state<AppSettings>(defaultSettings);
	let captionText = $state('');
	let hovering = $state(false);
	let resizing = $state(false);
	let debugInfo = $state('');

	let cleanup: (() => void) | null = null;

	onMount(() => {
		// Initialize debug info with translation
		debugInfo = $_('overlay.waiting');

		// Initialize async operations
		(async () => {
			// Set always on top from frontend (more reliable on Linux)
			try {
				const window = await getCurrentWindow();
				await window.setAlwaysOnTop(true);
				console.log('[Overlay] Set always on top');
			} catch (e) {
				console.error('[Overlay] Failed to set always on top:', e);
			}

			// Load settings
			try {
				settings = await invoke<AppSettings>('get_settings');
				console.log('[Overlay] Settings loaded:', settings);
				debugInfo = $_('overlay.settings_loaded');
			} catch (e) {
				console.error('[Overlay] Failed to load settings:', e);
				debugInfo = $_('overlay.error_loading') + ': ' + e;
			}

			// Listen for settings changes
			const unlistenSettings = await listen<AppSettings>('settings-changed', (event) => {
				console.log('[Overlay] Settings changed:', event.payload);
				settings = event.payload;
			});

			// Listen for caption updates from main window
			const unlistenCaption = await listen<{ text: string }>('caption-update', (event) => {
				console.log('[Overlay] Caption update received:', event.payload);
				captionText = event.payload.text;
				debugInfo = 'Caption received: ' + (event.payload.text ? event.payload.text.substring(0, 30) + '...' : '(empty)');
			});

			cleanup = () => {
				unlistenSettings();
				unlistenCaption();
			};
		})();

		return () => {
			cleanup?.();
		};
	});

	async function startDragging() {
		const window = await getCurrentWindow();
		await window.startDragging();
	}

	async function closeOverlay() {
		try {
			await invoke('close_overlay');
		} catch (e) {
			console.error('Failed to close overlay:', e);
		}
	}

	let startX = 0;
	let startY = 0;
	let startWidth = 0;
	let startHeight = 0;

	async function startResize(e: MouseEvent, corner: string) {
		e.preventDefault();
		e.stopPropagation();
		resizing = true;
		startX = e.clientX;
		startY = e.clientY;

		const window = await getCurrentWindow();
		const size = await window.innerSize();
		startWidth = size.width;
		startHeight = size.height;

		const handleMouseMove = async (moveEvent: MouseEvent) => {
			const deltaX = moveEvent.clientX - startX;
			const deltaY = moveEvent.clientY - startY;

			let newWidth = startWidth;
			let newHeight = startHeight;

			if (corner.includes('right')) {
				newWidth = Math.max(400, startWidth + deltaX);
			}
			if (corner.includes('bottom')) {
				newHeight = Math.max(60, startHeight + deltaY);
			}

			try {
				await invoke('set_overlay_size', {
					width: Math.round(newWidth),
					height: Math.round(newHeight)
				});
			} catch (e) {
				console.error('Failed to resize:', e);
			}
		};

		const handleMouseUp = () => {
			resizing = false;
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="overlay-container"
	class:hovering
	onmouseenter={() => (hovering = true)}
	onmouseleave={() => (hovering = false)}
>
	<!-- Drag Handle (top bar) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="drag-handle" onmousedown={startDragging}>
		<div class="drag-indicator"></div>
	</div>

	<!-- Close Button -->
	<button class="close-btn" onclick={closeOverlay} title={$_('overlay.close')}>
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
		</svg>
	</button>

	<!-- Caption Content -->
	<div class="caption-wrapper">
		{#if captionText}
			<CaptionDisplay text={captionText} fontSettings={settings.font} />
		{:else}
			<div class="debug-text">{debugInfo}</div>
		{/if}
	</div>

	<!-- Resize Handle (bottom-right) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="resize-handle resize-br" onmousedown={(e) => startResize(e, 'bottom-right')}>
		<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
			<path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
		</svg>
	</div>
</div>

<style>
	.overlay-container {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		/* Semi-transparent background since true transparency doesn't work on Linux GTK */
		background: rgba(26, 26, 26, 0.85);
		-webkit-app-region: no-drag;
	}

	.debug-text {
		color: rgba(255, 255, 255, 0.5);
		font-size: 14px;
		font-family: system-ui, sans-serif;
	}

	.drag-handle {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 100px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: move;
		-webkit-app-region: drag;
		opacity: 0;
		transition: opacity 0.2s ease;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 0 0 8px 8px;
	}

	.hovering .drag-handle {
		opacity: 1;
	}

	.drag-indicator {
		width: 40px;
		height: 4px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 2px;
	}

	.close-btn {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 0, 0, 0.6);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.2s ease, background 0.2s ease;
		color: white;
	}

	.hovering .close-btn {
		opacity: 1;
	}

	.close-btn:hover {
		background: rgba(255, 0, 0, 0.9);
	}

	.caption-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		max-width: 100%;
		padding: 20px;
	}

	.resize-handle {
		position: absolute;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s ease;
		color: rgba(255, 255, 255, 0.5);
	}

	.hovering .resize-handle {
		opacity: 1;
	}

	.resize-br {
		bottom: 4px;
		right: 4px;
		cursor: se-resize;
	}

	.resize-handle:hover {
		color: rgba(255, 255, 255, 0.9);
	}
</style>
