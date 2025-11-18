<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';

	// Import new UI components
	import SubtitleDisplay from '$lib/components/SubtitleDisplay.svelte';
	import OverlayBar from '$lib/components/OverlayBar.svelte';
	import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
	import ConnectionIndicator from '$lib/components/ConnectionIndicator.svelte';
	import StatusLayer from '$lib/components/StatusLayer.svelte';
	import type { ConnectionState } from '$lib/components/ConnectionIndicator.svelte';

	// Import stores and types
	import { prefersReducedMotion } from '$lib/stores/reduced-motion.ts';
	import { defaultSettings, type DisplaySettings } from '$lib/types/display-settings';

	// Import shared components
	import { CollaborationManager } from '$shared/collaboration/CollaborationManager';
	import { normalizeSessionCode } from '$shared/collaboration/sessionCode';
	import type { SessionInfo, Participant } from '$shared/collaboration/types';

	// Get session code from URL
	const sessionCode = $derived(normalizeSessionCode($page.params.code));

	// State
	let settings = $state<DisplaySettings>(defaultSettings);
	let drawerOpen = $state(false);
	let overlayMinimized = $state(false);
	let text = $state('');
	let lastUpdated = $state<number | null>(null);
	let connectionState = $state<ConnectionState>('connecting');
	let errorMessage = $state<string | null>(null);
	let collaborationManager: CollaborationManager | null = $state(null);
	let sessionInfo = $state<SessionInfo | null>(null);
	let participants = $state<Participant[]>([]);
	let autoscrollEnabled = $state(true);
	let showAutoscrollControl = $state(false);
	let hideControlTimeout: number | null = $state(null);

	const isOverlayMode = $derived(settings.mode === 'overlay');

	const backgroundStyle = $derived(
		isOverlayMode
			? 'background-color: #000000;'
			: `background-color: ${settings.backgroundColor};`
	);

	const stageStyle = $derived(`padding-bottom: ${settings.verticalPosition}vh;`);

	// Extract text from ProseMirror document stored in Yjs
	function extractTextFromYDoc() {
		if (!collaborationManager) {
			return '';
		}

		try {
			const xmlFrag = collaborationManager.ydoc.getXmlFragment('prosemirror');

			// Convert XML fragment to string
			const text = xmlFrag.toString();

			// Extract text content while preserving paragraph structure
			// 1. Replace closing paragraph tags with single newlines
			// 2. Strip all other XML tags
			// 3. Clean up spaces but preserve newlines
			const textOnly = text
				.replace(/<\/paragraph>/g, '\n')
				.replace(/<[^>]*>/g, '')
				.replace(/ +/g, ' ')
				.replace(/\n /g, '\n')
				.replace(/ \n/g, '\n')
				.trim();

			return textOnly;
		} catch (err) {
			console.error('[WEB-VIEWER] Error extracting text from Yjs:', err);
			return '';
		}
	}

	// Initialize collaboration
	onMount(async () => {
		if (!browser) return;

		try {
			const serverUrl = import.meta.env.VITE_YJS_SERVER_URL || 'wss://tekstiks.ee/kk';

			sessionInfo = {
				code: sessionCode,
				role: 'guest',
				roomName: sessionCode,
				serverUrl
			};

			console.log('[WEB-VIEWER] Setting up collaboration for session:', sessionCode);

			// Initialize and connect collaboration manager
			collaborationManager = new CollaborationManager();

			// Connect the collaboration manager
			collaborationManager.connect(sessionInfo, null as any, {
				onParticipantsChange: (p) => {
					participants = p;
					console.log('[WEB-VIEWER] Participants changed:', p);
				},
				onConnectionStatusChange: (connected) => {
					connectionState = connected ? 'connected' : 'disconnected';
					console.log('[WEB-VIEWER] Connection status:', connected);
				}
			});

			// Listen for Yjs document updates to refresh text
			collaborationManager.ydoc.on('update', (update: Uint8Array, origin: any) => {
				console.log('[WEB-VIEWER] Yjs update event fired', { updateSize: update.length, origin });
				const newText = extractTextFromYDoc();
				console.log('[WEB-VIEWER] Extracted text from update:', newText.substring(0, 100));
				if (newText !== text) {
					text = newText;
					lastUpdated = Date.now();
					console.log('[WEB-VIEWER] Text state updated:', text.substring(0, 100));
				}
			});

			// Initial text extraction - try multiple times
			let attempts = 0;
			const extractInterval = setInterval(() => {
				attempts++;
				console.log('[WEB-VIEWER] Attempting initial text extraction, attempt:', attempts);
				const extractedText = extractTextFromYDoc();
				console.log('[WEB-VIEWER] Extracted:', extractedText.substring(0, 100));

				if (extractedText) {
					text = extractedText;
					lastUpdated = Date.now();
					clearInterval(extractInterval);
					console.log('[WEB-VIEWER] Initial text extraction successful');
				} else if (attempts >= 10) {
					clearInterval(extractInterval);
					console.log('[WEB-VIEWER] Gave up on initial text extraction after 10 attempts');
				}
			}, 500);
		} catch (err) {
			console.error('[WEB-VIEWER] Failed to setup collaboration:', err);
			errorMessage = 'Failed to setup collaboration: ' + (err as Error).message;
			connectionState = 'error';
		}
	});

	onDestroy(() => {
		if (collaborationManager) {
			collaborationManager.disconnect();
		}
	});

	// Handle keyboard shortcuts
	$effect(() => {
		if (!browser || !drawerOpen) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				drawerOpen = false;
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});

	function handleSettingsChange(nextSettings: DisplaySettings) {
		settings = nextSettings;
	}

	function handleReset() {
		settings = defaultSettings;
		overlayMinimized = false;
	}

	function reconnect() {
		if (collaborationManager) {
			collaborationManager.disconnect();
			setTimeout(() => {
				if (sessionInfo) {
					collaborationManager?.connect(sessionInfo, null as any, {
						onParticipantsChange: (p) => {
							participants = p;
						},
						onConnectionStatusChange: (connected) => {
							connectionState = connected ? 'connected' : 'disconnected';
						}
					});
				}
			}, 100);
		}
	}

	function handleMouseMove() {
		if (!isOverlayMode) {
			showAutoscrollControl = true;
			if (hideControlTimeout !== null) {
				clearTimeout(hideControlTimeout);
			}
			hideControlTimeout = window.setTimeout(() => {
				showAutoscrollControl = false;
			}, 3000);
		}
	}

	function handleTouchStart() {
		if (!isOverlayMode) {
			showAutoscrollControl = true;
			if (hideControlTimeout !== null) {
				clearTimeout(hideControlTimeout);
			}
			hideControlTimeout = window.setTimeout(() => {
				showAutoscrollControl = false;
			}, 3000);
		}
	}

	function toggleAutoscroll() {
		autoscrollEnabled = !autoscrollEnabled;
	}
</script>

<svelte:head>
	<title>Session {sessionCode} - Kirikaja</title>
</svelte:head>

<div class="app-root" data-mode={settings.mode} style={backgroundStyle}>
	{#if !drawerOpen}
		<button type="button" class="gear-button" aria-label="Open settings" onclick={() => (drawerOpen = true)}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				height="24px"
				viewBox="0 -960 960 960"
				width="24px"
				fill="#e3e3e3"
			>
				<path
					d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"
				/>
			</svg>
		</button>
	{/if}

	<ConnectionIndicator state={connectionState} />

	<SettingsDrawer
		open={drawerOpen}
		{settings}
		onClose={() => (drawerOpen = false)}
		onChange={handleSettingsChange}
		onReset={handleReset}
	/>

	{#if isOverlayMode}
		<OverlayBar
			{text}
			{settings}
			{lastUpdated}
			minimized={overlayMinimized}
			onToggleMinimize={() => (overlayMinimized = !overlayMinimized)}
			onOpenSettings={() => (drawerOpen = true)}
		/>
		{#if connectionState !== 'connected'}
			<StatusLayer
				state={connectionState}
				onReconnect={reconnect}
				{errorMessage}
				variant="global"
			/>
		{/if}
	{:else}
		<div
			class="subtitle-stage"
			style={stageStyle}
			onmousemove={handleMouseMove}
			ontouchstart={handleTouchStart}
			role="main"
		>
			<SubtitleDisplay
				{text}
				{settings}
				{lastUpdated}
				variant="fullscreen"
				autoscrollEnabled={autoscrollEnabled}
			/>
			{#if connectionState !== 'connected'}
				<StatusLayer state={connectionState} onReconnect={reconnect} {errorMessage} />
			{/if}
			{#if showAutoscrollControl}
				<button
					type="button"
					class="autoscroll-toggle"
					onclick={toggleAutoscroll}
					aria-label={autoscrollEnabled ? 'Disable autoscroll' : 'Enable autoscroll'}
				>
					{#if autoscrollEnabled}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							height="24px"
							viewBox="0 -960 960 960"
							width="24px"
							fill="#e3e3e3"
						>
							<path
								d="M480-80 280-280l56-58 104 104v-526H320l160-160 160 160H520v526l104-104 56 58L480-80Z"
							/>
						</svg>
						<span>Autoscroll On</span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							height="24px"
							viewBox="0 -960 960 960"
							width="24px"
							fill="#e3e3e3"
						>
							<path
								d="m633-267-56-57 103-103H360v-80h320L577-610l56-57 200 200-200 200ZM480-80 280-280l56-58 104 104v-166h80v166l104-104 56 58L480-80Z"
							/>
						</svg>
						<span>Autoscroll Off</span>
					{/if}
				</button>
			{/if}
		</div>
	{/if}
</div>
