<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { MicVAD } from '@ricky0123/vad-web';
	import * as ort from 'onnxruntime-web';
	import { SpeechEditor, ShareSessionModal, EndSessionModal } from '$lib/components/prosemirror-speech';
	import { AudioSourceManager, type AudioSourceType, type AudioDevice } from '$lib/audioSourceManager';
	import MacOSAudioSetup from '$lib/components/MacOSAudioSetup.svelte';
	import { CollaborationManager } from '$lib/collaboration/CollaborationManager';
	import { generateSessionCode, normalizeSessionCode, isValidSessionCode } from '$lib/collaboration/sessionCode';
	import type { SessionInfo, Participant } from '$lib/collaboration/types';
	import SessionsModal from '$lib/components/modals/SessionsModal.svelte';
	import DictionariesModal from '$lib/components/modals/DictionariesModal.svelte';
	import { modalStore } from '$lib/stores/modalStore.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import ThemeSelector from '$lib/components/ThemeSelector.svelte';

	// Configure ONNX Runtime to use WASM only (disable WebGPU to avoid warnings)
	if (browser) {
		ort.env.wasm.numThreads = 1;
		ort.env.wasm.simd = true;
		ort.env.wasm.proxy = false;
	}

	// Audio processing constants
	const SAMPLE_RATE = 16000;
	const DEBUG_VAD = false;

	// Local ASR state (sherpa-onnx via Electron IPC)
	let asrInitialized = $state(false);
	let asrSessionActive = $state(false);
	let sessionId: string | null = null;
	let modelDownloadProgress = $state<ASRDownloadProgress | null>(null);
	let isDownloadingModel = $state(false);

	// VAD instance
	let vad: MicVAD | null = null;
	let isVadActive = $state(false);
	let isSpeaking = $state(false);
	let lastSpeechEndTime: number | null = null;
	let speechEndTimer: NodeJS.Timeout | null = null;

	// Audio source management
	let audioSourceManager = $state<AudioSourceManager | null>(null);
	let audioSourceType = $state<AudioSourceType>('microphone');
	let selectedDeviceId = $state<string | null>(null);
	let availableAudioDevices = $state<AudioDevice[]>([]);
	let systemAudioAvailable = $state(false);
	let isAudioSourceSwitching = $state(false);
	let customAudioStream: MediaStream | null = null;

	// macOS audio setup
	let showMacOSSetup = $state(false);
	let hasVirtualDevice = $state(false);

	// Pre-speech circular buffer
	const PRE_SPEECH_BUFFER_MS = 300;
	const FRAME_SIZE = 1536;
	const FRAMES_TO_BUFFER = Math.ceil((PRE_SPEECH_BUFFER_MS / 1000) * SAMPLE_RATE / FRAME_SIZE);
	let audioBuffer: Float32Array[] = [];
	let frameCount = 0;

	// Post-speech buffer
	const POST_SPEECH_BUFFER_MS = 2500;
	let postSpeechTimer: NodeJS.Timeout | null = null;

	// UI State
	let isConnected = $state(false);
	let isRecording = $state(false);
	let isWasmLoading = $state(false);
	let isWasmReady = $state(false);
	let initializationStatusKey = $state('');
	let connectionError = $state('');
	let microphoneError = $state('');
	let vadError = $state('');

	// Derived state for localized status
	let initializationStatus = $derived(initializationStatusKey ? $_(initializationStatusKey) : '');

	// Transcript state
	let transcript = $state('');
	let partialTranscript = $state('');
	const selectedLanguage = 'et';
	let availableModels = $state<string[]>([]);

	// Speech Editor
	let speechEditor: any = $state(null);

	// Collaboration
	let collaborationManager = $state<CollaborationManager | null>(null);
	let sessionInfo = $state<SessionInfo | null>(null);
	let participants = $state<Participant[]>([]);
	let collaborationConnected = $state(false);
	let showShareModal = $state(false);
	let showEndSessionModal = $state(false);
	let joinSessionCode = $state('');
	let currentDbSession = $state<TranscriptionSession | null>(null);
	let plannedAndActiveSessions = $state<TranscriptionSession[]>([]);
	let isLoadingSessions = $state(false);

	// UI panels
	let showSettingsPanel = $state(false);
	let showSessionPanel = $state(false);

	// ═══════════════════════════════════════════════════════════════
	// MODEL TYPE HELPERS
	// ═══════════════════════════════════════════════════════════════

	function isOfflineModel(language: string): boolean {
		return language !== 'et' && language !== 'en';
	}

	// ═══════════════════════════════════════════════════════════════
	// COLLABORATION FUNCTIONS
	// ═══════════════════════════════════════════════════════════════

	async function loadCollaborationSessions() {
		if (!window.db || !browser) return;

		isLoadingSessions = true;
		try {
			const [planned, active] = await Promise.all([
				window.db.getSessionsByStatus('planned'),
				window.db.getSessionsByStatus('active')
			]);
			plannedAndActiveSessions = [...planned, ...active].sort((a, b) => {
				if (a.status === 'active' && b.status !== 'active') return -1;
				if (b.status === 'active' && a.status !== 'active') return 1;
				const dateA = a.scheduled_date || a.created_at;
				const dateB = b.scheduled_date || b.created_at;
				return new Date(dateA).getTime() - new Date(dateB).getTime();
			});
		} catch (err) {
			console.error('[COLLAB] Failed to load sessions:', err);
		} finally {
			isLoadingSessions = false;
		}
	}

	async function startCollaborativeSession(dbSessionId?: string) {
		const code = generateSessionCode();
		const serverUrl = import.meta.env.VITE_YJS_SERVER_URL || 'wss://tekstiks.ee/kk';

		let tempSessionInfo = {
			code,
			role: 'host' as const,
			roomName: code,
			serverUrl
		};

		if (window.db && browser) {
			try {
				if (dbSessionId) {
					currentDbSession = await window.db.getSession(dbSessionId);
					if (currentDbSession) {
						if (currentDbSession.session_code) {
							tempSessionInfo.code = currentDbSession.session_code;
							tempSessionInfo.roomName = currentDbSession.session_code;
						}
						await window.db.activateSession(dbSessionId);
						currentDbSession = await window.db.getSession(dbSessionId);
					}
				} else {
					const sessionName = `Session ${new Date().toLocaleString()}`;
					const sessionId = await window.db.createSession(code, sessionName, null, null);
					currentDbSession = await window.db.getSession(sessionId);
				}
			} catch (err) {
				console.error('[DB] Failed to create/load session:', err);
			}
		}

		let existingContent: object | null = null;

		if (currentDbSession?.id && window.db) {
			try {
				const savedState = await window.db.getEditorState(currentDbSession.id);
				if (savedState) {
					existingContent = JSON.parse(savedState);
				}
			} catch (err) {
				console.error('[COLLAB] Failed to parse saved editor state:', err);
			}
		}

		if (!existingContent) {
			existingContent = speechEditor?.getDocJSON?.() || null;
			if (existingContent && currentDbSession?.id && window.db) {
				try {
					await window.db.saveEditorState(currentDbSession.id, JSON.stringify(existingContent));
				} catch (err) {
					console.error('[COLLAB] Failed to save initial content:', err);
				}
			}
		}

		if (collaborationManager) {
			collaborationManager.disconnect();
		}
		collaborationManager = new CollaborationManager();

		collaborationManager.initializeProvider(tempSessionInfo, {
			onParticipantsChange: (p: any) => {
				participants = p;
			},
			onConnectionStatusChange: (connected: any) => {
				collaborationConnected = connected;
			}
		}, {
			initialContent: existingContent || undefined
		});

		sessionInfo = tempSessionInfo;
		showSessionPanel = false;
	}

	function joinCollaborativeSession(code: string) {
		const normalizedCode = normalizeSessionCode(code);

		if (!isValidSessionCode(normalizedCode)) {
			alert($_('collaboration.invalid_code', { default: 'Invalid session code' }));
			return;
		}

		const serverUrl = import.meta.env.VITE_YJS_SERVER_URL || 'wss://tekstiks.ee/kk';

		const tempSessionInfo = {
			code: normalizedCode,
			role: 'guest' as const,
			roomName: normalizedCode,
			serverUrl
		};

		if (collaborationManager) {
			collaborationManager.disconnect();
		}
		collaborationManager = new CollaborationManager();

		collaborationManager.initializeProvider(tempSessionInfo, {
			onParticipantsChange: (p: any) => {
				participants = p;
			},
			onConnectionStatusChange: (connected: any) => {
				collaborationConnected = connected;
			}
		});

		sessionInfo = tempSessionInfo;
		showSessionPanel = false;
	}

	async function disconnectCollaboration(skipRefresh = false) {
		if (speechEditor && currentDbSession?.id && window.db) {
			try {
				const docJson = speechEditor.getDocJSON?.();
				if (docJson) {
					await window.db.saveEditorState(currentDbSession.id, JSON.stringify(docJson));
				}
			} catch (error) {
				console.error('[SESSION] Failed to save editor state on leave:', error);
			}
		}

		if (collaborationManager) {
			collaborationManager.disconnect();
			collaborationManager = null;
		}
		sessionInfo = null;
		currentDbSession = null;
		participants = [];
		collaborationConnected = false;
		showShareModal = false;

		if (!skipRefresh) {
			await loadCollaborationSessions();
		}
	}

	async function handleEndSession(deleteContent: boolean) {
		showEndSessionModal = false;

		if (isRecording) {
			await stopRecording();
		}

		if (speechEditor) {
			await speechEditor.saveState();
		}

		if (currentDbSession && window.db) {
			try {
				await window.db.endSession(currentDbSession.id, deleteContent);
			} catch (error) {
				console.error('[SESSION] Failed to end session:', error);
			}
		}

		await disconnectCollaboration(true);
		await loadCollaborationSessions();
	}

	// Audio source management functions
	async function loadAudioDevices(skipDesktopSources: boolean = false) {
		if (!audioSourceManager) return;
		try {
			if (audioSourceType === 'microphone') {
				try {
					const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
					stream.getTracks().forEach((track) => track.stop());
				} catch (e) {
					console.warn('[AUDIO] Could not get permission for device enumeration:', e);
				}
			}

			availableAudioDevices = await audioSourceManager.enumerateAudioDevices(audioSourceType, skipDesktopSources);
		} catch (error) {
			console.error('[AUDIO] Failed to enumerate devices:', error);
		}
	}

	async function getAudioStream(): Promise<MediaStream> {
		if (!audioSourceManager) {
			throw new Error('AudioSourceManager not initialized');
		}

		if (customAudioStream) {
			return customAudioStream;
		}

		if (audioSourceType === 'system') {
			return await audioSourceManager.getSystemAudioStream(selectedDeviceId);
		} else {
			return await audioSourceManager.getMicrophoneStream(selectedDeviceId);
		}
	}

	async function checkMacOSSetupNeeds() {
		if (!audioSourceManager) return;

		if (audioSourceManager.getPlatform() === 'darwin' && audioSourceType === 'system') {
			hasVirtualDevice = await audioSourceManager.hasVirtualAudioDevice();

			if (!hasVirtualDevice) {
				showMacOSSetup = true;
			}
		}
	}

	async function switchAudioSource(newType: AudioSourceType, deviceId: string | null = null) {
		if (!audioSourceManager || isAudioSourceSwitching) return;

		isAudioSourceSwitching = true;
		vadError = '';

		try {
			const oldType = audioSourceType;

			if (isRecording) {
				await stopRecording();

				audioSourceType = newType;

				if (oldType !== newType) {
					await loadAudioDevices();
					selectedDeviceId = null;
				} else {
					selectedDeviceId = deviceId;
				}

				if (customAudioStream) {
					customAudioStream.getTracks().forEach((track) => track.stop());
					customAudioStream = null;
				}

				await new Promise((r) => setTimeout(r, 300));

				await startRecording();
			} else {
				audioSourceType = newType;

				if (oldType !== newType) {
					await loadAudioDevices();
					selectedDeviceId = null;
				} else {
					selectedDeviceId = deviceId;
				}

				if (customAudioStream) {
					customAudioStream.getTracks().forEach((track) => track.stop());
					customAudioStream = null;
				}
			}

			await checkMacOSSetupNeeds();

			if (window.electronAPI) {
				await window.electronAPI.setSetting('audio_source_type', newType);
				if (deviceId) {
					await window.electronAPI.setSetting('audio_device_id', deviceId);
				}
			}
		} catch (error: any) {
			console.error('[AUDIO] Failed to switch source:', error);
			vadError = `Failed to switch audio source: ${error.message}`;
		} finally {
			isAudioSourceSwitching = false;
		}
	}

	async function initializeAudioSourceManager() {
		if (!audioSourceManager) {
			audioSourceManager = new AudioSourceManager();
			await audioSourceManager.initialize();

			systemAudioAvailable = await audioSourceManager.checkSystemAudioSupport();

			await loadAudioDevices(true);

			if (audioSourceType === 'system' && !systemAudioAvailable) {
				audioSourceType = 'microphone';
				vadError = 'System audio not available. Please follow the setup instructions below or use microphone.';
			}
		}
	}

	async function initializeVAD() {
		isWasmLoading = true;

		await initializeAudioSourceManager();

		if (audioSourceType === 'system' && availableAudioDevices.length === 0) {
			await loadAudioDevices(false);
		}

		try {
			customAudioStream = await getAudioStream();
		} catch (error: any) {
			console.error('[INIT-VAD] Failed to get audio stream:', error);
			vadError = `Failed to get audio stream: ${error.message}`;
			isWasmLoading = false;
			return;
		}

		vad = await MicVAD.new({
			stream: customAudioStream,
			positiveSpeechThreshold: 0.5,
			negativeSpeechThreshold: 0.35,
			preSpeechPadMs: 300,
			redemptionMs: 250,
			minSpeechMs: 100,

			onFrameProcessed: (probabilities: any, frame: Float32Array) => {
				if (!isRecording || !isVadActive) {
					return;
				}

				frameCount++;

				audioBuffer.push(new Float32Array(frame));
				if (audioBuffer.length > FRAMES_TO_BUFFER) {
					audioBuffer.shift();
				}

				sendAudioToASR(frame);
			},

			onSpeechStart: () => {
				return;
			},

			onSpeechEnd: (audio: Float32Array) => {
				return;
			},

			onVADMisfire: () => {
				if (DEBUG_VAD) console.log('⚠️ [VAD] VAD misfire detected');
				isSpeaking = false;
			},

			workletURL: '/vad/vad.worklet.bundle.min.js',
			modelURL: '/vad/silero_vad_legacy.onnx',
			baseAssetPath: '/vad/',
			onnxWASMBasePath: '/onnx/',

			startOnLoad: false
		} as any);

		isWasmLoading = false;
		isWasmReady = true;
	}

	async function initializeSystem() {
		try {
			if (window.asr) {
				initializationStatusKey = 'dictate.initializingASR';

				window.asr.onDownloadProgress((progress) => {
					modelDownloadProgress = progress;
					isDownloadingModel = progress.overallProgress < 100;
				});

				const asrResult = await window.asr.initialize();

				if (!asrResult.success) {
					vadError = asrResult.error || $_('dictate.failedToInitializeASR');
					initializationStatusKey = 'dictate.initializationFailed';
					return;
				}

				asrInitialized = true;
				isConnected = true;
				isDownloadingModel = false;
			} else {
				isConnected = false;
			}

			initializationStatusKey = 'dictate.loadingVadModel';

			await initializeVAD();

			initializationStatusKey = 'dictate.readyToRecord';
		} catch (error: any) {
			console.error('[INIT] ❌ Failed to initialize system:', error);
			isWasmLoading = false;
			isWasmReady = false;

			if (error.message?.includes('vad') || error.message?.includes('onnx')) {
				vadError = $_('dictate.failedToLoadVadModel');
			} else {
				vadError = error.message || $_('dictate.initializationFailed');
			}
			initializationStatusKey = 'dictate.initializationFailed';
		}
	}

	async function startASRSession() {
		if (!window.asr || !asrInitialized) {
			connectionError = $_('dictate.asrNotInitialized', { default: 'ASR not initialized' });
			return false;
		}

		try {
			connectionError = '';

			const result = await window.asr.start();

			if (result.success) {
				asrSessionActive = true;
				sessionId = result.sessionId || null;
				isConnected = true;
				return true;
			} else {
				connectionError = result.error || $_('dictate.failedToStartASR');
				return false;
			}
		} catch (error: any) {
			console.error('[ASR] Error starting session:', error);
			connectionError = error.message || $_('dictate.failedToStartASR');
			return false;
		}
	}

	async function stopASRSession() {
		if (!window.asr) return;

		try {
			const result = await window.asr.stop();

			if (result.text?.trim()) {
				handleTranscript_streaming({
					text: result.text,
					is_final: true
				});
			}

			asrSessionActive = false;
			sessionId = null;
		} catch (error) {
			console.error('[ASR] Error stopping session:', error);
			asrSessionActive = false;
			sessionId = null;
		}
	}

	function handleTranscript_streaming(message: any) {
		if (speechEditor && message.text.trim()) {
			speechEditor.insertStreamingText({
				text: message.text + ' ',
				isFinal: message.is_final,
				start: message.start,
				end: message.end
			});
		}

		if (message.is_final) {
			if (message.text.trim()) {
				transcript += (transcript ? ' ' : '') + message.text.trim();
			}
			partialTranscript = '';
		} else {
			if (message.text.trim() || !partialTranscript) {
				partialTranscript = message.text;
			}
		}
	}

	function handleError_streaming(message: any) {
		if (message.message && message.message.includes('Session not found') && isRecording) {
			return;
		}

		connectionError = message.message;
	}

	function handleSessionReady_streaming(sessionIdReceived: string) {
		sessionId = sessionIdReceived;
	}

	function handleServerMessage_streaming(message: any) {
		switch (message.type) {
			case 'ready':
				handleSessionReady_streaming(message.session_id);
				if (message.available_models) {
					availableModels = message.available_models;
				}
				break;

			case 'transcript':
				handleTranscript_streaming(message);
				break;

			case 'error':
				handleError_streaming(message);
				break;

			case 'session_ended':
				sessionId = null;
				break;
		}
	}

	function handleTranscript_offline(message: any) {
		handleTranscript_streaming(message);
	}

	function handleError_offline(message: any) {
		if (message.message && message.message.includes('Session not found') && isRecording) {
			return;
		}

		connectionError = message.message;
	}

	function handleSessionReady_offline(sessionIdReceived: string) {
		sessionId = sessionIdReceived;
	}

	function handleServerMessage_offline(message: any) {
		switch (message.type) {
			case 'ready':
				handleSessionReady_offline(message.session_id);
				if (message.available_models) {
					availableModels = message.available_models;
				}
				break;

			case 'transcript':
				handleTranscript_offline(message);
				break;

			case 'error':
				handleError_offline(message);
				break;

			case 'session_ended':
				break;
		}
	}

	async function sendAudioToASR(audioData: Float32Array) {
		if (!window.asr || !asrSessionActive) {
			return;
		}

		try {
			const result = await window.asr.sendAudio(audioData);

			if (result.error) {
				if (result.error.includes('No active session') && isRecording) {
					await startASRSession();
				}
				return;
			}

			if (result.text !== undefined) {
				handleTranscript_streaming({
					text: result.text,
					is_final: result.isFinal
				});
			}
		} catch (error) {
			console.error('[ASR] IPC error:', error);
		}
	}

	async function startRecording() {
		try {
			microphoneError = '';
			vadError = '';
			connectionError = '';

			if (!asrInitialized) {
				if (!window.asr) {
					connectionError = $_('dictate.asrNotInitialized', { default: 'Speech recognition not available. Please ensure you are running the Electron app.' });
					return;
				}

				connectionError = $_('dictate.initializingASR', { default: 'Initializing speech recognition...' });
				
				const asrResult = await window.asr.initialize();
				
				if (!asrResult.success) {
					const errorMsg = asrResult.error || $_('dictate.failedToInitializeASR', { default: 'Failed to initialize speech recognition' });
					connectionError = errorMsg;
					return;
				}

				asrInitialized = true;
				isConnected = true;
			}

			if (vad) {
				try {
					vad.destroy();
				} catch (e) {
					console.warn('[START] Error destroying VAD:', e);
				}
				vad = null;
			}

			isWasmReady = false;
			await initializeVAD();

			if (!isWasmReady || !vad) {
				vadError = $_('dictate.failedToInitializeVoiceDetection');
				return;
			}

			const sessionStarted = await startASRSession();
			if (!sessionStarted) {
				return;
			}

			frameCount = 0;

			if (!vad) {
				throw new Error('VAD is not initialized');
			}
			const vadInstance: MicVAD = vad as MicVAD;
			await vadInstance.start();

			isVadActive = true;
			isRecording = true;
			isSpeaking = true;

			speechEditor?.startTiming();

			if (speechEditor?.hasContent()) {
				speechEditor.signalVadSpeechEnd();
			}

		} catch (error: any) {
			console.error('[START] ❌ Failed to start recording:', error);

			if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
				microphoneError = $_('dictate.providePermission');
			} else if (error.name === 'NotFoundError') {
				microphoneError = $_('dictate.noMicrophoneFound');
			} else if (error.name === 'NotReadableError') {
				microphoneError = $_('dictate.microphoneInUse');
			} else {
				microphoneError = error.message || $_('dictate.initializationFailed');
			}
			stopRecording();
		}
	}

	async function stopRecording() {
		isRecording = false;
		isVadActive = false;
		isSpeaking = false;

		if (postSpeechTimer) {
			clearTimeout(postSpeechTimer);
			postSpeechTimer = null;
		}

		if (speechEditor && speechEditor.view) {
			const tr = speechEditor.view.state.tr;
			tr.setMeta('recordingEnded', true);
			speechEditor.view.dispatch(tr);
		}

		speechEditor?.stopTiming();

		if (vad) {
			try {
				const vadInstance: MicVAD = vad as MicVAD;
				await vadInstance.pause();
				vad.destroy();
				vad = null;
			} catch (error) {
				console.error('Error stopping VAD:', error);
			}
		}

		audioBuffer = [];

		await stopASRSession();

		await new Promise(resolve => setTimeout(resolve, 500));
	}

	function clearTranscript() {
		transcript = '';
		partialTranscript = '';
	}

	function downloadTranscript() {
		const text = transcript || $_('dictate.resultsPlaceholder');
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `transcript-${new Date().toISOString()}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(async () => {
		await initializeSystem();

		window.addEventListener('beforeunload', handleBeforeUnload);

		if (window.electronAPI) {
			const savedType = await window.electronAPI.getSetting('audio_source_type');
			const savedDeviceId = await window.electronAPI.getSetting('audio_device_id');

			if (savedType) {
				audioSourceType = savedType as AudioSourceType;
				await loadAudioDevices(true);
			}
			if (savedDeviceId) {
				const deviceExists = availableAudioDevices.some(d => d.deviceId === savedDeviceId);
				if (deviceExists) {
					selectedDeviceId = savedDeviceId;
				} else {
					selectedDeviceId = null;
				}
			}
		}

		if (browser) {
			const urlParams = new URLSearchParams(window.location.search);

			const sessionId = urlParams.get('session');
			if (sessionId) {
				setTimeout(async () => {
					await startCollaborativeSession(sessionId);
				}, 500);
			}

			const joinCode = urlParams.get('join');
			if (joinCode && !sessionId) {
				joinSessionCode = joinCode;
				setTimeout(() => {
					if (joinSessionCode) {
						joinCollaborativeSession(joinSessionCode);
					}
				}, 500);
			}
		}

		if (typeof window !== 'undefined' && window.electronAPI?.onDeepLinkJoin) {
			window.electronAPI.onDeepLinkJoin((sessionCode) => {
				joinSessionCode = sessionCode;
				setTimeout(() => {
					if (joinSessionCode) {
						joinCollaborativeSession(joinSessionCode);
					}
				}, 500);
			});
		}

		// Load sessions for the panel
		await loadCollaborationSessions();
	});

	function handleBeforeUnload() {
		if (speechEditor && currentDbSession && window.db) {
			try {
				const docJson = speechEditor.getDocJSON?.();
				if (docJson) {
					window.db.saveEditorState(currentDbSession.id, JSON.stringify(docJson));
				}
			} catch (error) {
				console.error('[SESSION] Failed to save on beforeunload:', error);
			}
		}
	}

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		}

		stopRecording();

		if (vad) {
			try {
				vad.destroy();
				vad = null;
			} catch (error) {
				console.error('Error destroying VAD on unmount:', error);
			}
		}

		if (window.asr) {
			window.asr.removeDownloadProgressListener();
		}
	});

	// Close panels when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.settings-panel') && !target.closest('.settings-trigger')) {
			showSettingsPanel = false;
		}
		if (!target.closest('.session-panel') && !target.closest('.session-trigger')) {
			showSessionPanel = false;
		}
	}
</script>

<svelte:head>
	<title>Jutukuva</title>
</svelte:head>

<svelte:window on:click={handleClickOutside} />

<!-- Model Download Progress Modal -->
{#if isDownloadingModel && modelDownloadProgress}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-base-100 p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4">
			<h3 class="text-xl font-semibold mb-6 text-center">
				{$_('dictate.downloadingModel', { default: 'Downloading speech recognition model...' })}
			</h3>
			<div class="space-y-4">
				<div>
					<div class="flex justify-between text-sm mb-2">
						<span class="text-base-content/70">{$_('dictate.overallProgress', { default: 'Overall progress' })}</span>
						<span class="font-medium">{modelDownloadProgress.overallProgress}%</span>
					</div>
					<div class="w-full bg-base-200 rounded-full h-3 overflow-hidden">
						<div
							class="bg-primary h-3 rounded-full transition-all duration-300"
							style="width: {modelDownloadProgress.overallProgress}%"
						></div>
					</div>
				</div>
				<p class="text-sm text-base-content/60 text-center">
					{modelDownloadProgress.currentFile}
				</p>
			</div>
			<p class="text-xs text-base-content/40 text-center mt-6">
				{$_('dictate.downloadOnce', { default: 'This only needs to be done once.' })}
			</p>
		</div>
	</div>
{/if}

<div class="h-screen flex flex-col bg-linear-to-br from-base-100 via-base-100 to-base-200/30">
	<!-- Clean Header -->
	<header class="shrink-0 border-b border-base-200/80 bg-base-100/95 backdrop-blur-sm">
		<div class="max-w-6xl mx-auto px-6 py-4">
			<div class="flex items-center justify-between">
				<!-- Left: Status -->
				<div class="flex items-center gap-4 min-w-0 flex-1">
					{#if connectionError}
						<div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-error/10 text-error text-sm">
							<span class="w-2 h-2 rounded-full bg-error"></span>
							<span class="truncate max-w-[200px]">{connectionError}</span>
							<button class="hover:bg-error/20 rounded-full p-0.5 transition-colors" onclick={() => connectionError = ''} aria-label="Dismiss">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
								</svg>
							</button>
						</div>
					{:else if isRecording}
						<div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-error/10 text-error text-sm font-medium">
							<span class="w-2 h-2 rounded-full bg-error animate-pulse"></span>
							<span>{$_('dictate.recording', { default: 'Recording' })}</span>
						</div>
					{:else if isWasmLoading || !isWasmReady}
						<div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-info/10 text-info text-sm">
							<span class="loading loading-spinner loading-xs"></span>
							<span>{initializationStatus}</span>
						</div>
					{:else if isWasmReady && isConnected}
						<div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success text-sm font-medium">
							<span class="w-2 h-2 rounded-full bg-success"></span>
							<span>{$_('dictate.readyToRecord', { default: 'Ready' })}</span>
						</div>
					{/if}

					{#if sessionInfo}
					<button
								class="cursor-pointer rounded p-0.5 transition-colors"
								onclick={() => sessionInfo && navigator.clipboard.writeText(sessionInfo.code)}
								title={$_('share_session.copy')}
								aria-label={$_('share_session.copy')}
							>
						<div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 text-secondary text-sm font-medium">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
							</svg>
							<span class="font-mono">{sessionInfo.code}</span>
							
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
								</svg>
							
						</div>
					</button>
					{/if}
				</div>

				<!-- Center: Record Button -->
				<div class="flex justify-center">
					{#if !isRecording}
						<button
							class="group relative flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-content shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 cursor-pointer"
							onclick={startRecording}
							disabled={!isWasmReady || (sessionInfo?.role === 'guest')}
							title={sessionInfo?.role === 'guest' ? $_('collaboration.guest_cannot_record') : $_('dictate.startRecording')}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
							</svg>
						</button>
					{:else}
						<button
							class="group relative flex items-center justify-center w-12 h-12 rounded-full bg-error text-error-content shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
							onclick={stopRecording}
							title={$_('dictate.stopRecording')}
							aria-label={$_('dictate.stopRecording')}
						>
							<div class="absolute inset-0 rounded-full bg-error/30 animate-ping"></div>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 relative" viewBox="0 0 24 24" fill="currentColor">
								<rect x="6" y="6" width="12" height="12" rx="2" />
							</svg>
						</button>
					{/if}
				</div>

				<!-- Right: Tools -->
				<div class="flex items-center justify-end gap-2 flex-1">
					<!-- Sessions Button -->
					<div class="relative">
						<button
							class="session-trigger flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-base-200/70 transition-colors text-sm font-medium text-base-content/80 hover:text-base-content cursor-pointer"
							onclick={() => { showSessionPanel = !showSessionPanel; showSettingsPanel = false; loadCollaborationSessions(); }}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
							</svg>
							<span class="hidden sm:inline">{$_('nav.sessions', { default: 'Sessions' })}</span>
						</button>

						{#if showSessionPanel}
							<div class="session-panel absolute right-0 top-full mt-2 w-80 bg-base-100 rounded-xl shadow-2xl border border-base-200 overflow-hidden z-50">
								<div class="p-4 border-b border-base-200 bg-base-50">
									<h3 class="font-semibold text-base">{$_('collaboration.collaborative_session', { default: 'Sessions' })}</h3>
								</div>
								
								{#if !sessionInfo}
									<div class="p-3 space-y-2">
										<button class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-base-200/50 transition-colors text-left" onclick={() => startCollaborativeSession()}>
											<div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
												<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
												</svg>
											</div>
											<div>
												<div class="font-medium text-sm">{$_('collaboration.start_session', { default: 'Start New Session' })}</div>
												<div class="text-xs text-base-content/60">{$_('collaboration.create_new_session', { default: 'Create a new recording session' })}</div>
											</div>
										</button>
									</div>

									<div class="px-4 py-2 bg-base-200/30">
										<p class="text-xs font-medium text-base-content/60 uppercase tracking-wide">{$_('collaboration.join_existing', { default: 'Join Session' })}</p>
									</div>
									<div class="p-3">
										<div class="flex gap-2 items-center">
											<input
												type="text"
												placeholder={$_('collaboration.enter_code', { default: 'Enter code' })}
												class="flex-1 input input-xs input-ghost font-mono uppercase text-center tracking-widest"
												maxlength="6"
												bind:value={joinSessionCode}
												oninput={(e) => { joinSessionCode = e.currentTarget.value.toUpperCase(); }}
												onkeydown={(e) => { if (e.key === 'Enter' && joinSessionCode.length === 6) joinCollaborativeSession(joinSessionCode); }}
											/>
											<button
												class="btn btn-sm btn-primary"
												disabled={joinSessionCode.length !== 6}
												onclick={() => joinCollaborativeSession(joinSessionCode)}
											>
												{$_('collaboration.join', { default: 'Join' })}
											</button>
										</div>
									</div>

									{#if plannedAndActiveSessions.length > 0}
										<div class="px-4 py-2 bg-base-200/30">
											<p class="text-xs font-medium text-base-content/60 uppercase tracking-wide">{$_('collaboration.your_sessions', { default: 'Your Sessions' })}</p>
										</div>
										<div class="max-h-48 overflow-y-auto">
											{#each plannedAndActiveSessions as session (session.id)}
												<button class="w-full flex items-center gap-3 p-3 hover:bg-base-200/50 transition-colors text-left border-b border-base-200/50 last:border-0" onclick={() => startCollaborativeSession(session.id)}>
													<div class="flex-1 min-w-0">
														<div class="font-medium text-sm truncate">{session.name}</div>
														<div class="flex items-center gap-2 text-xs text-base-content/60">
															{#if session.session_code}
																<span class="font-mono">{session.session_code}</span>
															{/if}
															{#if session.scheduled_date}
																<span>{new Date(session.scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
															{/if}
														</div>
													</div>
													<span class={`badge badge-sm ${session.status === 'active' ? 'badge-success' : 'badge-info'}`}>
														{session.status === 'active' ? $_('sessions.status.active', { default: 'Active' }) : $_('sessions.status.planned', { default: 'Planned' })}
													</span>
												</button>
											{/each}
										</div>
									{/if}

									<div class="p-3 border-t border-base-200">
										<button class="w-full flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-base-200/50 transition-colors text-sm text-base-content/70" onclick={() => { modalStore.openSessions(); showSessionPanel = false; }}>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
											</svg>
											{$_('collaboration.manage_sessions', { default: 'Manage All Sessions' })}
										</button>
									</div>
								{:else}
									<!-- Active session panel -->
									<div class="p-4 space-y-3">
										<div class="bg-base-200/30 rounded-lg p-4 text-center">
											<p class="text-xs text-base-content/60 mb-1">{$_('share_session.code_label', { default: 'Session Code' })}</p>
											<p class="font-mono text-2xl font-bold tracking-widest">{sessionInfo.code}</p>
										</div>
										
										<div class="grid grid-cols-2 gap-2">
											<button class="btn btn-sm btn-ghost" onclick={() => (showShareModal = true)}>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
												</svg>
												{$_('collaboration.share', { default: 'Share' })}
											</button>
											<button class="btn btn-sm btn-ghost" onclick={() => disconnectCollaboration()}>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
												</svg>
												{$_('collaboration.leave', { default: 'Leave' })}
											</button>
										</div>
									</div>
									
									<div class="p-3 border-t border-base-200">
										<button class="w-full btn btn-sm btn-error btn-outline" onclick={() => (showEndSessionModal = true)}>
											{$_('collaboration.end_session', { default: 'End Session' })}
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Dictionaries Button -->
					<button
						class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-base-200/70 transition-colors text-sm font-medium text-base-content/80 hover:text-base-content cursor-pointer"
						onclick={() => modalStore.openDictionaries()}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
						</svg>
						<span class="hidden sm:inline">{$_('nav.textSnippets', { default: 'Substitutions' })}</span>
					</button>

					<!-- Divider -->
					<div class="w-px h-6 bg-base-300"></div>

					<!-- Settings Button -->
					<div class="relative">
						<button
							class="settings-trigger flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-base-200/70 transition-colors text-base-content/80 hover:text-base-content cursor-pointer"
							onclick={() => { showSettingsPanel = !showSettingsPanel; showSessionPanel = false; }}
							title={$_('settings.title', { default: 'Settings' })}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
						</button>

						{#if showSettingsPanel}
							<div class="settings-panel absolute right-0 top-full mt-2 w-72 bg-base-100 rounded-xl shadow-2xl border border-base-200 overflow-hidden z-50">
								<div class="p-4 border-b border-base-200 bg-base-50">
									<h3 class="font-semibold text-base">{$_('settings.title', { default: 'Settings' })}</h3>
								</div>
								
								<div class="p-4 space-y-4">
									<!-- Audio Source -->
									<div>
										<label for="audio-source-select" class="text-sm font-medium text-base-content/70 mb-2 block">{$_('dictate.audioSource', { default: 'Audio Source' })}</label>
										<select
											id="audio-source-select"
											class="select select-xs select-ghost w-full"
											bind:value={audioSourceType}
											onchange={() => switchAudioSource(audioSourceType, selectedDeviceId)}
											disabled={isAudioSourceSwitching || !isWasmReady}
										>
											<option value="microphone">🎤 {$_('dictate.audioSourceMicrophone', { default: 'Microphone' })}</option>
											{#if systemAudioAvailable}
												<option value="system">🔊 {$_('dictate.audioSourceSystem', { default: 'System Audio' })}</option>
											{/if}
										</select>
									</div>

									<!-- Device Selection -->
									{#if availableAudioDevices.length > 0}
										<div>
											<label for="device-select" class="text-sm font-medium text-base-content/70 mb-2 block">{$_('dictate.device', { default: 'Device' })}</label>
											<select
												id="device-select"
												class="select select-xs select-ghost w-full"
												bind:value={selectedDeviceId}
												onchange={() => switchAudioSource(audioSourceType, selectedDeviceId)}
												disabled={isAudioSourceSwitching || !isWasmReady}
											>
												<option value={null}>{$_('dictate.deviceDefault', { default: 'Default' })}</option>
												{#each availableAudioDevices as device}
													<option value={device.deviceId}>{device.label}</option>
												{/each}
											</select>
										</div>
									{/if}

									<div class="pt-2 border-t border-base-200">
										<span class="text-sm font-medium text-base-content/70 mb-2 block">{$_('settings.appearance', { default: 'Appearance' })}</span>
										<div class="flex items-center gap-3 w-full">
											<LanguageSelector />
											<ThemeSelector />
										</div>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</header>

	<!-- Error Messages -->
	{#if microphoneError || vadError}
		<div class="shrink-0 px-6 py-3 bg-warning/10 border-b border-warning/20">
			<div class="max-w-6xl mx-auto flex items-center gap-3">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<span class="text-sm text-warning flex-1">{microphoneError || vadError}</span>
				<button class="btn btn-ghost btn-xs btn-circle" onclick={() => { microphoneError = ''; vadError = ''; }} aria-label="Dismiss">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>
		</div>
	{/if}

	<!-- Main Content: Editor -->
	<main class="flex-1 overflow-hidden">
		<div class="h-full max-w-6xl mx-auto px-6 py-6">
			{#key sessionInfo?.code || 'solo'}
				<SpeechEditor
					bind:this={speechEditor}
					collaborationManager={collaborationManager}
					sessionId={currentDbSession?.id || ''}
					config={{
						fontSize: 18
					}}
					class="h-full"
				/>
			{/key}
		</div>
	</main>
</div>

<!-- Share Session Modal -->
{#if showShareModal && sessionInfo}
	<ShareSessionModal
		{sessionInfo}
		{participants}
		onClose={() => (showShareModal = false)}
	/>
{/if}

<!-- macOS Audio Setup Modal -->
{#if showMacOSSetup}
	<MacOSAudioSetup
		{hasVirtualDevice}
		onClose={() => (showMacOSSetup = false)}
	/>
{/if}

<!-- End Session Modal -->
{#if showEndSessionModal && sessionInfo}
	<EndSessionModal
		sessionName={currentDbSession?.name || sessionInfo.code}
		onConfirm={handleEndSession}
		onCancel={() => (showEndSessionModal = false)}
	/>
{/if}

<!-- Sessions Modal (SPA overlay) -->
<SessionsModal
	bind:open={modalStore.showSessionsModal}
	onActivateSession={(sessionId) => startCollaborativeSession(sessionId)}
	onClose={() => modalStore.closeSessions()}
/>

<!-- Dictionaries Modal (SPA overlay) -->
<DictionariesModal
	bind:open={modalStore.showDictionariesModal}
	onClose={() => modalStore.closeDictionaries()}
	onDictionariesChanged={() => speechEditor?.reloadTextSnippetEntries()}
/>
