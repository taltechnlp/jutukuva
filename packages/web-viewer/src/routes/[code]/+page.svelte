<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';

	// Import shared components
	import { SpeechEditor, ReadOnlyEditorPreview, SessionStatus } from '$shared/components/prosemirror-speech';
	import { CollaborationManager } from '$shared/collaboration/CollaborationManager';
	import { normalizeSessionCode } from '$shared/collaboration/sessionCode';
	import type { SessionInfo, Participant } from '$shared/collaboration/types';
	import type { SubtitleSegment, Word } from '$shared/components/prosemirror-speech/utils/types';

	// Get session code from URL
	const sessionCode = $derived(normalizeSessionCode($page.params.code));

	// State
	let speechEditor: any = $state(null);
	let subtitleSegments = $state<SubtitleSegment[]>([]);
	let collaborationManager: CollaborationManager | null = $state(null);
	let sessionInfo = $state<SessionInfo | null>(null);
	let participants = $state<Participant[]>([]);
	let collaborationConnected = $state(false);
	let isInitializing = $state(true);
	let error = $state('');
	let editorReady = $state(false);

	// Initialize collaboration BEFORE editor mounts
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

			// Initialize and connect collaboration manager FIRST
			collaborationManager = new CollaborationManager();

			// Connect the collaboration manager (editorView not used in connect())
			collaborationManager.connect(sessionInfo, null as any, {
				onParticipantsChange: (p) => {
					participants = p;
					console.log('[WEB-VIEWER] Participants changed:', p);
				},
				onConnectionStatusChange: (connected) => {
					collaborationConnected = connected;
					console.log('[WEB-VIEWER] Connection status:', connected);
					if (connected) {
						isInitializing = false;
					}
				}
			});

			// Wait a moment for initial Yjs sync
			await new Promise(resolve => setTimeout(resolve, 500));

			// Log Yjs document state after sync
			const xmlFrag = collaborationManager.ydoc.getXmlFragment('prosemirror');
			console.log('[WEB-VIEWER] Yjs doc state after sync:', {
				clientID: collaborationManager.provider?.awareness.clientID,
				docSize: collaborationManager.ydoc.store.clients.size,
				xmlFragmentLength: xmlFrag.length,
				xmlFragmentString: xmlFrag.toString()
			});

			// Listen for Yjs document updates
			collaborationManager.ydoc.on('update', (update: Uint8Array, origin: any) => {
				console.log('[WEB-VIEWER] Yjs document updated:', {
					updateSize: update.length,
					origin: origin?.constructor?.name,
					xmlFragmentLength: xmlFrag.length,
					xmlContent: xmlFrag.toString().substring(0, 200)
				});
			});

			// Now we can render the editor with the connected collaboration manager
			editorReady = true;
			console.log('[WEB-VIEWER] Collaboration manager ready, rendering editor');
		} catch (err) {
			console.error('[WEB-VIEWER] Failed to setup collaboration:', err);
			error = 'Failed to setup collaboration: ' + (err as Error).message;
			isInitializing = false;
		}
	});

	onDestroy(() => {
		if (collaborationManager) {
			collaborationManager.disconnect();
		}
	});

	function handleWordApproved(word: Word) {
		console.log('[WEB-VIEWER] Word approved:', word.text);
	}

	function handleSubtitleEmit(srt: string, segment: SubtitleSegment) {
		console.log('[WEB-VIEWER] Subtitle emitted:', segment);
	}
</script>

<svelte:head>
	<title>Session {sessionCode} - Kirikaja</title>
</svelte:head>

<div class="container mx-auto p-4">
	<!-- Header -->
	<div class="mb-6">
		<div class="flex items-center justify-between mb-4">
			<div>
				<h1 class="text-3xl font-bold">Kirikaja</h1>
				<p class="text-sm text-base-content/60">
					{$_('web_viewer.web_mode', { default: 'Web Viewer (Guest Mode)' })}
				</p>
			</div>

			<!-- Desktop app link -->
			<a
				href="/"
				class="btn btn-sm btn-outline"
				title={$_('web_viewer.back_to_home', { default: 'Back to home' })}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 19l-7-7m0 0l7-7m-7 7h18"
					/>
				</svg>
				{$_('web_viewer.home', { default: 'Home' })}
			</a>
		</div>

		<!-- Session Status -->
		{#if sessionInfo}
			<SessionStatus
				{sessionInfo}
				{participants}
				connected={collaborationConnected}
			/>
		{/if}

		<!-- Initializing/Error Messages -->
		{#if isInitializing}
			<div class="alert alert-info mt-4">
				<span class="loading loading-spinner loading-sm"></span>
				<span>{$_('web_viewer.connecting', { default: 'Connecting to session...' })}</span>
			</div>
		{:else if error}
			<div class="alert alert-error mt-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="stroke-current shrink-0 h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		<!-- Web Viewer Info Banner -->
		<div class="alert alert-warning mt-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="stroke-current shrink-0 h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>
				{$_('web_viewer.guest_limitations', {
					default:
						'You are viewing as a guest. You can edit text and confirm words, but cannot record audio. To use recording features, download the desktop app.'
				})}
			</span>
		</div>
	</div>

	<!-- Editor and Preview -->
	<div class="flex flex-col xl:flex-row xl:items-start gap-6">
		<!-- Speech Editor -->
		<div class="xl:flex-[2] flex-1 min-w-[500px]">
			{#if editorReady && collaborationManager}
				<SpeechEditor
					bind:this={speechEditor}
					collaborationManager={collaborationManager}
					config={{
						fontSize: 16,
						onWordApproved: handleWordApproved,
						onSubtitleEmit: handleSubtitleEmit
					}}
				/>
			{:else if !error}
				<div class="alert alert-info">
					<span class="loading loading-spinner loading-sm"></span>
					<span>Loading editor...</span>
				</div>
			{/if}
		</div>

		<!-- Read-Only Editor Preview -->
		<div class="xl:flex-[1] flex-1 min-w-[500px]">
			<ReadOnlyEditorPreview
				collaborationManager={collaborationManager}
				class="h-[600px]"
			/>
		</div>
	</div>
</div>
