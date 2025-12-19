<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { _ } from 'svelte-i18n';

	// Import new UI components
	import SubtitleDisplay from '$lib/components/SubtitleDisplay.svelte';
	import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
	import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';

	// Import stores and types
	import { defaultSettings, type DisplaySettings } from '$lib/types/display-settings';

	// Import shared components
	import { CollaborationManager } from '$shared/collaboration/CollaborationManager';
	import { normalizeSessionCode } from '$shared/collaboration/sessionCode';
	import type { SessionInfo, Participant } from '$shared/collaboration/types';

	import { AutoScroller } from '$lib/actions/autoscroll.svelte';
	import type { Speaker } from '$shared/collaboration/types';

	// Get session code and password from URL
	const sessionCode = $derived(normalizeSessionCode($page.params.code || ''));
	const urlPassword = $derived($page.url.searchParams.get('password') || '');

	// State
	let settings = $state<DisplaySettings>(defaultSettings);
	let passwordRequired = $state(false);
	let passwordInput = $state('');
	let passwordError = $state('');
	let drawerOpen = $state(false);
	// Overlay minimized state removed as overlay mode is gone
	let text = $state('');
	let lastUpdated = $state<number | null>(null);
	let errorMessage = $state<string | null>(null);
	let connectionState = $state<'connected' | 'disconnected' | 'error'>('disconnected');
	let collaborationManager: CollaborationManager | null = $state(null);
	let sessionInfo = $state<SessionInfo | null>(null);
	let participants = $state<Participant[]>([]);
	let speakers = $state<Speaker[]>([]);
	// Autoscroll is always enabled in smart mode
	let autoscrollEnabled = $state(true);
	// Store observer and interval for cleanup
	let xmlFragmentObserver: (() => void) | null = null;
	let speakersObserver: (() => void) | null = null;
	let extractInterval: ReturnType<typeof setInterval> | null = null;
	let updateHandler: ((update: Uint8Array, origin: any) => void) | null = null;

	// AutoScroller instance
	const scroller = new AutoScroller({ enabled: true });

	$effect(() => {
		scroller.enabled = autoscrollEnabled;
	});

	// Trigger autoscroll update when text changes
	$effect(() => {
		text; // dependency
		tick().then(() => scroller.update());
	});

	const backgroundStyle = $derived(`background-color: ${settings.backgroundColor};`);

	// Apply alignment and padding to the content wrapper
	const alignmentMap = {
		full: 'stretch',
		left: 'flex-start',
		middle: 'center',
		right: 'flex-end'
	};
	
	const contentStyle = $derived(
		`align-items: ${alignmentMap[settings.horizontalAlignment]}; ` +
		`padding-bottom: ${settings.viewMode === 'text' ? '2rem' : '0'};`
	);

	// ... (keep extractTextFromYDoc and onMount/onDestroy) ...

	/**
	 * Get speaker name by ID, with fallback
	 */
	function getSpeakerName(speakerId: string | null): string | null {
		if (!speakerId || !collaborationManager) return null;
		const speaker = collaborationManager.getSpeaker(speakerId);
		return speaker?.name || null;
	}

	function extractTextFromYDoc() {
		if (!collaborationManager) {
			return '';
		}

		try {
			const xmlFrag = collaborationManager.ydoc.getXmlFragment('prosemirror');

			// Convert XML fragment to string
			const rawText = xmlFrag.toString();

			// Debug: log the raw XML to understand structure
			console.log('[WEB-VIEWER] XML fragment toString length:', rawText.length);
			if (rawText && rawText.length > 0) {
				console.log('[WEB-VIEWER] Raw XML fragment:', rawText.substring(0, 500));
			} else {
				console.log('[WEB-VIEWER] XML fragment is empty');
			}

			// Extract text content with speaker prefixes
			// Parse paragraph by paragraph to include speaker info
			const paragraphs: string[] = [];

			// Match each paragraph element with its attributes and content
			const paragraphRegex = /<paragraph([^>]*)>([\s\S]*?)<\/paragraph>/g;
			let match;

			while ((match = paragraphRegex.exec(rawText)) !== null) {
				const attrs = match[1];
				const content = match[2];

				// Extract speakerId from attributes
				const speakerIdMatch = attrs.match(/speakerId="([^"]*)"/);
				const speakerId = speakerIdMatch ? speakerIdMatch[1] : null;

				// Get speaker name
				const speakerName = getSpeakerName(speakerId);

				// Strip XML tags from content to get plain text
				const plainText = content
					.replace(/<[^>]*>/g, '')
					.replace(/ +/g, ' ')
					.trim();

				if (plainText) {
					// Add speaker prefix if available
					if (speakerName) {
						paragraphs.push(`${speakerName}: ${plainText}`);
					} else {
						paragraphs.push(plainText);
					}
				}
			}

			// If regex didn't match (different XML structure), fall back to simple extraction
			if (paragraphs.length === 0) {
				const textOnly = rawText
					.replace(/<\/paragraph>/g, '\n')
					.replace(/<[^>]*>/g, '')
					.replace(/ +/g, ' ')
					.replace(/\n /g, '\n')
					.replace(/ \n/g, '\n')
					.trim();
				return textOnly;
			}

			return paragraphs.join('\n');
		} catch (err) {
			console.error('[WEB-VIEWER] Error extracting text from Yjs:', err);
			return '';
		}
	}

	// Helper function to connect with optional password
	function connectWithPassword(password?: string) {
		const serverUrl = import.meta.env.VITE_YJS_SERVER_URL || 'wss://tekstiks.ee/kk';

		sessionInfo = {
			code: sessionCode,
			role: 'guest',
			roomName: sessionCode,
			serverUrl,
			password: password || undefined
		};

		console.log('[WEB-VIEWER] Setting up collaboration for session:', sessionCode, password ? '(with password)' : '');

		// Initialize and connect collaboration manager
		if (collaborationManager) {
			collaborationManager.disconnect();
		}
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
				if (connected) {
					passwordRequired = false;
					passwordError = '';
				}
			}
		});

		// Listen for connection errors (for password-protected sessions)
		collaborationManager.provider?.on('connection-close', (event: any) => {
			console.log('[WEB-VIEWER] Connection closed:', event?.code, event?.reason);
			// Check if it's a password error (code 4001 from our server)
			if (event?.code === 4001 || event?.reason?.includes('password') || event?.reason?.includes('Invalid')) {
				passwordRequired = true;
				passwordError = urlPassword
					? $_('viewer.wrong_password', { default: 'Incorrect password' })
					: '';
				connectionState = 'error';
			}
		});

		// Also listen for WebSocket errors which might indicate password issues
		collaborationManager.provider?.ws?.addEventListener('close', (event: CloseEvent) => {
			console.log('[WEB-VIEWER] WebSocket close event:', event.code, event.reason);
			if (event.code === 4001) {
				passwordRequired = true;
				passwordError = urlPassword
					? $_('viewer.wrong_password', { default: 'Incorrect password' })
					: '';
				connectionState = 'error';
			}
		});

		// Setup text observers
		setupTextObservers();
	}

	// Setup text observers for the collaboration manager
	function setupTextObservers() {
		if (!collaborationManager) return;

		// Get XML fragment and observe it for changes
		const xmlFrag = collaborationManager.ydoc.getXmlFragment('prosemirror');

		// Function to update text from XML fragment
		const updateTextFromFragment = () => {
			const newText = extractTextFromYDoc();
			if (newText !== text) {
				text = newText;
				lastUpdated = Date.now();
				console.log('[WEB-VIEWER] Text updated from XML fragment:', newText.substring(0, 100));
			}
		};

		// Observe XML fragment for changes (more reliable than polling)
		const observer = () => {
			console.log('[WEB-VIEWER] XML fragment changed');
			updateTextFromFragment();
		};
		xmlFrag.observe(observer);
		xmlFragmentObserver = () => xmlFrag.unobserve(observer);

		// Observe speakers map for changes (to update speaker prefixes)
		const speakersMap = collaborationManager.ydoc.getMap('speakers');
		const speakersObserverFn = () => {
			console.log('[WEB-VIEWER] Speakers changed');
			speakers = collaborationManager?.getSpeakers() || [];
			// Re-extract text to update speaker prefixes
			updateTextFromFragment();
		};
		speakersMap.observe(speakersObserverFn);
		speakersObserver = () => speakersMap.unobserve(speakersObserverFn);

		// Initial speakers load
		speakers = collaborationManager.getSpeakers();

		// Also listen for Yjs document updates as a fallback
		updateHandler = (update: Uint8Array, origin: any) => {
			console.log('[WEB-VIEWER] Yjs update event fired', { updateSize: update.length, origin });
			// Small delay to ensure XML fragment is updated
			setTimeout(() => {
				updateTextFromFragment();
			}, 10);
		};
		collaborationManager.ydoc.on('update', updateHandler);

		// Initial text extraction - try a few times after connection
		// Wait for provider to sync first
		let attempts = 0;
		extractInterval = setInterval(() => {
			attempts++;
			const extractedText = extractTextFromYDoc();
			console.log('[WEB-VIEWER] Initial extraction attempt:', attempts, 'text length:', extractedText.length);

			if (extractedText) {
				text = extractedText;
				lastUpdated = Date.now();
				if (extractInterval) {
					clearInterval(extractInterval);
					extractInterval = null;
				}
				console.log('[WEB-VIEWER] Initial text extraction successful');
			} else if (attempts >= 20) {
				if (extractInterval) {
					clearInterval(extractInterval);
					extractInterval = null;
				}
				console.log('[WEB-VIEWER] Initial extraction complete (will update when content arrives)');
			}
		}, 500);
	}

	// Handle password submit
	function handlePasswordSubmit() {
		if (!passwordInput.trim()) {
			passwordError = $_('viewer.password_required_error', { default: 'Please enter a password' });
			return;
		}
		passwordError = '';
		connectWithPassword(passwordInput.trim());
	}

	// Initialize collaboration
	onMount(async () => {
		if (!browser) return;

		try {
			// Use password from URL if available
			connectWithPassword(urlPassword || undefined);
		} catch (err) {
			console.error('[WEB-VIEWER] Failed to setup collaboration:', err);
			errorMessage = 'Failed to setup collaboration: ' + (err as Error).message;
			connectionState = 'error';
		}
	});

	onDestroy(() => {
		// Clean up observers and intervals
		if (xmlFragmentObserver) {
			xmlFragmentObserver();
			xmlFragmentObserver = null;
		}
		if (speakersObserver) {
			speakersObserver();
			speakersObserver = null;
		}
		if (extractInterval) {
			clearInterval(extractInterval);
			extractInterval = null;
		}
		if (collaborationManager && updateHandler) {
			collaborationManager.ydoc.off('update', updateHandler);
			updateHandler = null;
		}
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
</script>

<svelte:head>
	<title>Session {sessionCode} - Jutukuva</title>
</svelte:head>

<div class="app-root" data-mode={settings.viewMode} style={backgroundStyle}>
	{#if !drawerOpen}
		<button type="button" class="gear-button" aria-label={$_('aria.open_settings')} onclick={() => (drawerOpen = true)}>
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

	<ConnectionStatus state={connectionState} />

	<!-- Password Prompt Modal -->
	{#if passwordRequired}
		<div class="password-modal">
			<div class="password-modal-content">
				<h2>{$_('viewer.password_required', { default: 'Password Required' })}</h2>
				<p>{$_('viewer.password_required_description', { default: 'This session is password protected. Please enter the password to join.' })}</p>

				{#if passwordError}
					<div class="password-error">{passwordError}</div>
				{/if}

				<form onsubmit={(e) => { e.preventDefault(); handlePasswordSubmit(); }}>
					<input
						type="password"
						class="password-input"
						placeholder={$_('viewer.password_placeholder', { default: 'Enter password' })}
						bind:value={passwordInput}
						autofocus
					/>
					<button type="submit" class="password-submit">
						{$_('viewer.connect', { default: 'Connect' })}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<SettingsDrawer
		open={drawerOpen}
		{settings}
		onClose={() => (drawerOpen = false)}
		onChange={handleSettingsChange}
		onReset={handleReset}
	/>

	<div class="subtitle-stage" role="main" use:scroller.action>
		<div class="subtitle-content" style={contentStyle}>
			<SubtitleDisplay {text} {settings} {lastUpdated} />
		</div>
	</div>

	{#if scroller.isScrolledUp}
		<button
			type="button"
			class="scroll-to-bottom"
			aria-label={$_('aria.scroll_to_bottom')}
			onclick={scroller.scrollToBottom}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="currentColor"
			>
				<path d="M12 16l-6-6h12z" transform="rotate(0 12 12)" />
			</svg>
		</button>
	{/if}
</div>

<style>
	.password-modal {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.password-modal-content {
		background: #1a1a2e;
		padding: 2rem;
		border-radius: 12px;
		max-width: 400px;
		width: 90%;
		text-align: center;
	}

	.password-modal-content h2 {
		color: #fff;
		margin: 0 0 1rem 0;
		font-size: 1.5rem;
	}

	.password-modal-content p {
		color: #aaa;
		margin: 0 0 1.5rem 0;
		font-size: 0.9rem;
	}

	.password-error {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
		padding: 0.75rem;
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.password-input {
		width: 100%;
		padding: 0.75rem 1rem;
		font-size: 1rem;
		border: 1px solid #444;
		border-radius: 6px;
		background: #2a2a4e;
		color: #fff;
		margin-bottom: 1rem;
		box-sizing: border-box;
	}

	.password-input:focus {
		outline: none;
		border-color: #6366f1;
	}

	.password-submit {
		width: 100%;
		padding: 0.75rem 1rem;
		font-size: 1rem;
		font-weight: 500;
		background: #6366f1;
		color: #fff;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.2s;
	}

	.password-submit:hover {
		background: #5458dd;
	}
</style>
