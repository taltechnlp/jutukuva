<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { MicVAD } from '@ricky0123/vad-web';
	import * as ort from 'onnxruntime-web';
	import { SpeechEditor, ShareSessionModal, EndSessionModal } from '$lib/components/prosemirror-speech';
	import type { SubtitleSegment } from '$lib/components/prosemirror-speech/utils/types';
	import { AudioSourceManager, type AudioSourceType, type AudioDevice } from '$lib/audioSourceManager';
	import MacOSAudioSetup from '$lib/components/MacOSAudioSetup.svelte';
	import { CollaborationManager } from '$lib/collaboration/CollaborationManager';
	import { generateSessionCode, normalizeSessionCode, isValidSessionCode } from '$lib/collaboration/sessionCode';
	import type { SessionInfo, Participant } from '$lib/collaboration/types';
	import SessionsModal from '$lib/components/modals/SessionsModal.svelte';
	import DictionariesModal from '$lib/components/modals/DictionariesModal.svelte';
	import { modalStore } from '$lib/stores/modalStore.svelte';

	// Configure ONNX Runtime to use WASM only (disable WebGPU to avoid warnings)
	if (browser) {
		// Disable WebGPU - commented out due to readonly property in newer versions
		// ort.env.webgpu = { disabled: true } as any;

		// Configure WASM
		ort.env.wasm.numThreads = 1;
		ort.env.wasm.simd = true;
		ort.env.wasm.proxy = false;
	}

	// Audio processing constants
	const SAMPLE_RATE = 16000;
	const DEBUG_VAD = false; // Set to true to enable verbose VAD logging

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
	const PRE_SPEECH_BUFFER_MS = 300; // 300ms pre-speech buffer
	const FRAME_SIZE = 1536; // VAD frame size at 16kHz
	const FRAMES_TO_BUFFER = Math.ceil((PRE_SPEECH_BUFFER_MS / 1000) * SAMPLE_RATE / FRAME_SIZE);
	let audioBuffer: Float32Array[] = [];
	let frameCount = 0; // Track total frames received for debugging

	// Post-speech buffer - continue sending audio to ASR after VAD detects silence
	const POST_SPEECH_BUFFER_MS = 2500; // 2.5 second post-speech buffer
	let postSpeechTimer: NodeJS.Timeout | null = null;

	// UI State
	let isConnected = $state(false);
	let isRecording = $state(false);
	let isWasmLoading = $state(false);
	let isWasmReady = $state(false);
	let initializationStatusKey = $state(''); // Store translation key, not translated string
	let connectionError = $state('');
	let microphoneError = $state('');
	let vadError = $state('');

	// Derived state for localized status
	let initializationStatus = $derived(initializationStatusKey ? $_(initializationStatusKey) : '');


	// Transcript state
	let transcript = $state('');
	let partialTranscript = $state('');
	// Language is fixed to Estonian
	const selectedLanguage = 'et';
	let availableModels = $state<string[]>([]);

	// Speech Editor
	let speechEditor: any = $state(null);
	let subtitleSegments = $state<SubtitleSegment[]>([]);

	// Collaboration
	let collaborationManager = $state<CollaborationManager | null>(null);
	let sessionInfo = $state<SessionInfo | null>(null);
	let participants = $state<Participant[]>([]);
	let collaborationConnected = $state(false);
	let showShareModal = $state(false);
	let showEndSessionModal = $state(false);
	let showCollabMenu = $state(false); // New state for collab menu
	let showSettings = $state(false);   // New state for settings menu
	let joinSessionCode = $state('');
	let currentDbSession = $state<TranscriptionSession | null>(null);
	let plannedAndActiveSessions = $state<TranscriptionSession[]>([]);
	let isLoadingSessions = $state(false);

	// ═══════════════════════════════════════════════════════════════
	// MODEL TYPE HELPERS
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Determine if the selected language uses an offline model (Parakeet).
	 *
	 * STREAMING MODELS (ET/EN):
	 * - Continuous session (no [Session Ended])
	 * - Full hypothesis in each partial update
	 * - Session ID stable until user stops
	 *
	 * OFFLINE MODELS (Parakeet):
	 * - 15-second buffer sessions with [Session Ended]
	 * - Incremental text across sessions
	 * - Session ID changes frequently during recording
	 */
	function isOfflineModel(language: string): boolean {
		return language !== 'et' && language !== 'en';
	}


	// ═══════════════════════════════════════════════════════════════
	// COLLABORATION FUNCTIONS
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Load planned and active sessions for the dropdown
	 */
	async function loadCollaborationSessions() {
		if (!window.db || !browser) return;

		isLoadingSessions = true;
		try {
			const [planned, active] = await Promise.all([
				window.db.getSessionsByStatus('planned'),
				window.db.getSessionsByStatus('active')
			]);
			// Combine and sort by scheduled_date (upcoming first) then created_at
			plannedAndActiveSessions = [...planned, ...active].sort((a, b) => {
				// Active sessions first
				if (a.status === 'active' && b.status !== 'active') return -1;
				if (b.status === 'active' && a.status !== 'active') return 1;
				// Then by scheduled date
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

	/**
	 * Start a new collaborative session as host
	 */
	async function startCollaborativeSession(dbSessionId?: string) {
		const code = generateSessionCode();
		const serverUrl = import.meta.env.VITE_YJS_SERVER_URL || 'wss://tekstiks.ee/kk';

		console.log('[COLLAB] Starting session with server URL:', serverUrl);
		console.log('[COLLAB] Environment variable VITE_YJS_SERVER_URL:', import.meta.env.VITE_YJS_SERVER_URL);

		// Prepare session info (but don't set it yet to avoid triggering editor remount)
		let tempSessionInfo = {
			code,
			role: 'host' as const,
			roomName: code,
			serverUrl
		};

		// Create or load session in database
		if (window.db && browser) {
			try {
				if (dbSessionId) {
					// Load existing session from DB
					currentDbSession = await window.db.getSession(dbSessionId);
					if (currentDbSession) {
						// Use the session code from DB if available
						if (currentDbSession.session_code) {
							tempSessionInfo.code = currentDbSession.session_code;
							tempSessionInfo.roomName = currentDbSession.session_code;
						}
						// Activate the session
						await window.db.activateSession(dbSessionId);
						currentDbSession = await window.db.getSession(dbSessionId);
					}
				} else {
					// Create new session in database
					const sessionName = `Session ${new Date().toLocaleString()}`;
					const sessionId = await window.db.createSession(code, sessionName, null, null);
					currentDbSession = await window.db.getSession(sessionId);
				}
			} catch (err) {
				console.error('[DB] Failed to create/load session:', err);
			}
		}

		// Capture existing editor content BEFORE creating collaboration manager
		// This ensures existing content is preserved when starting a session
		const existingContent = speechEditor?.getDocJSON?.() || null;
		console.log('[COLLAB] speechEditor:', speechEditor);
		console.log('[COLLAB] existingContent:', existingContent);
		if (existingContent) {
			console.log('[COLLAB] Capturing existing editor content for Yjs initialization, paragraphs:', (existingContent as any)?.content?.length);
		}

		// Create and initialize CollaborationManager BEFORE setting sessionInfo
		if (collaborationManager) {
			collaborationManager.disconnect();
		}
		collaborationManager = new CollaborationManager();

		// Initialize the provider now (without editor) so plugins can be created
		console.log('[COLLAB] About to call initializeProvider with sessionInfo:', tempSessionInfo);
		collaborationManager.initializeProvider(tempSessionInfo, {
			onParticipantsChange: (p: any) => {
				participants = p;
			},
			onConnectionStatusChange: (connected: any) => {
				collaborationConnected = connected;
				console.log('[COLLAB] Connection status changed:', connected);
			}
		}, {
			initialContent: existingContent || undefined
		});

		// Now set sessionInfo to trigger editor remount with collaborationManager ready
		sessionInfo = tempSessionInfo;

		console.log('[COLLAB] Started session as host:', tempSessionInfo.code);
	}

	/**
	 * Join an existing collaborative session as guest
	 */
	function joinCollaborativeSession(code: string) {
		const normalizedCode = normalizeSessionCode(code);

		if (!isValidSessionCode(normalizedCode)) {
			alert($_('collaboration.invalid_code', { default: 'Invalid session code' }));
			return;
		}

		const serverUrl = import.meta.env.VITE_YJS_SERVER_URL || 'wss://tekstiks.ee/kk';

		// Prepare session info (but don't set it yet to avoid triggering editor remount)
		const tempSessionInfo = {
			code: normalizedCode,
			role: 'guest' as const,
			roomName: normalizedCode,
			serverUrl
		};

		// Create and initialize CollaborationManager BEFORE setting sessionInfo
		if (collaborationManager) {
			collaborationManager.disconnect();
		}
		collaborationManager = new CollaborationManager();

		// Initialize the provider now (without editor) so plugins can be created
		collaborationManager.initializeProvider(tempSessionInfo, {
			onParticipantsChange: (p: any) => {
				participants = p;
			},
			onConnectionStatusChange: (connected: any) => {
				collaborationConnected = connected;
				console.log('[COLLAB] Connection status changed:', connected);
			}
		});

		// Now set sessionInfo to trigger editor remount with collaborationManager ready
		sessionInfo = tempSessionInfo;

		console.log('[COLLAB] Joined session as guest:', normalizedCode);
	}

	/**
	 * Disconnect from collaborative session
	 */
	function disconnectCollaboration() {
		if (collaborationManager) {
			collaborationManager.disconnect();
			collaborationManager = null;
		}
		sessionInfo = null;
		participants = [];
		collaborationConnected = false;
		showShareModal = false;
	}

	/**
	 * Handle end session confirmation
	 */
	async function handleEndSession(deleteContent: boolean) {
		showEndSessionModal = false;

		// Stop recording if active
		if (isRecording) {
			await stopRecording();
		}

		// Save editor state before ending
		if (speechEditor) {
			await speechEditor.saveState();
		}

		// End session in database
		if (currentDbSession && window.db) {
			try {
				await window.db.endSession(currentDbSession.id, deleteContent);
				console.log('[SESSION] Session ended:', currentDbSession.id, 'deleteContent:', deleteContent);
			} catch (error) {
				console.error('[SESSION] Failed to end session:', error);
			}
		}

		// Disconnect collaboration
		disconnectCollaboration();

		// Reset current db session
		currentDbSession = null;
	}

	// Handle subtitle segment emitted
	function handleSubtitleEmit(srt: string, segment: SubtitleSegment) {
		console.log('[SUBTITLE] Emitted:', srt);
		subtitleSegments = [...subtitleSegments, segment];
		// TODO: Send subtitle to streaming endpoint or WebSocket
	}

	// Audio source management functions
	async function loadAudioDevices(skipDesktopSources: boolean = false) {
		if (!audioSourceManager) return;
		try {
			// Request permission first to get device labels (only for microphone)
			// Skip this for system audio to avoid triggering permission dialogs
			if (audioSourceType === 'microphone') {
				try {
					const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
					stream.getTracks().forEach((track) => track.stop());
				} catch (e) {
					console.warn('[AUDIO] Could not get permission for device enumeration:', e);
				}
			}

			// Enumerate devices filtered by current source type
			// Skip desktop sources during initialization to avoid permission prompts
			availableAudioDevices = await audioSourceManager.enumerateAudioDevices(audioSourceType, skipDesktopSources);
			console.log(
				`[AUDIO] Found ${availableAudioDevices.length} ${audioSourceType} device(s)`
			);
		} catch (error) {
			console.error('[AUDIO] Failed to enumerate devices:', error);
		}
	}

	async function getAudioStream(): Promise<MediaStream> {
		if (!audioSourceManager) {
			throw new Error('AudioSourceManager not initialized');
		}

		// If we have a custom stream from source switching, use it
		if (customAudioStream) {
			return customAudioStream;
		}

		// Otherwise get stream based on selected source type
		if (audioSourceType === 'system') {
			return await audioSourceManager.getSystemAudioStream(selectedDeviceId);
		} else {
			return await audioSourceManager.getMicrophoneStream(selectedDeviceId);
		}
	}

	async function checkMacOSSetupNeeds() {
		if (!audioSourceManager) return;

		// Only check if on macOS and using system audio
		if (audioSourceManager.getPlatform() === 'darwin' && audioSourceType === 'system') {
			hasVirtualDevice = await audioSourceManager.hasVirtualAudioDevice();

			// Show setup wizard if no virtual device found
			if (!hasVirtualDevice) {
				console.log('[AUDIO] No virtual audio device found on macOS, showing setup wizard');
				showMacOSSetup = true;
			}
		}
	}

	async function switchAudioSource(newType: AudioSourceType, deviceId: string | null = null) {
		if (!audioSourceManager || isAudioSourceSwitching) return;

		console.log(`[AUDIO] Switching to ${newType}`, deviceId);
		isAudioSourceSwitching = true;
		vadError = '';

		try {
			const oldType = audioSourceType;

			// If recording, need to restart VAD
			if (isRecording) {
				console.log('[AUDIO] Recording active, restarting with new source...');

				// Stop current recording
				await stopRecording();

				// Update source
				audioSourceType = newType;

				// Reload device list if switching source type
				if (oldType !== newType) {
					await loadAudioDevices();
					selectedDeviceId = null; // Reset device selection when switching types
				} else {
					selectedDeviceId = deviceId;
				}

				// Clear custom stream so getAudioStream will fetch new one
				if (customAudioStream) {
					customAudioStream.getTracks().forEach((track) => track.stop());
					customAudioStream = null;
				}

				// Wait for cleanup
				await new Promise((r) => setTimeout(r, 300));

				// Restart with new source
				await startRecording();
			} else {
				// Just update the selection for next recording
				audioSourceType = newType;

				// Reload device list if switching source type
				if (oldType !== newType) {
					await loadAudioDevices();
					selectedDeviceId = null; // Reset device selection when switching types
				} else {
					selectedDeviceId = deviceId;
				}

				// Clear any cached stream
				if (customAudioStream) {
					customAudioStream.getTracks().forEach((track) => track.stop());
					customAudioStream = null;
				}
			}

			// Check for macOS setup needs
			await checkMacOSSetupNeeds();

			// Save preference
			if (window.electronAPI) {
				await window.electronAPI.setSetting('audio_source_type', newType);
				if (deviceId) {
					await window.electronAPI.setSetting('audio_device_id', deviceId);
				}
			}

			console.log(`[AUDIO] ✓ Switched to ${newType}`);
		} catch (error: any) {
			console.error('[AUDIO] Failed to switch source:', error);
			vadError = `Failed to switch audio source: ${error.message}`;
		} finally {
			isAudioSourceSwitching = false;
		}
	}

	// Initialize audio source manager (only once)
	async function initializeAudioSourceManager() {
		if (!audioSourceManager) {
			console.log('[INIT-AUDIO] Initializing audio source manager...');
			audioSourceManager = new AudioSourceManager();
			await audioSourceManager.initialize();

			// Check system audio availability
			systemAudioAvailable = await audioSourceManager.checkSystemAudioSupport();
			console.log('[INIT-AUDIO] System audio available:', systemAudioAvailable);

			// Load available audio devices, but skip desktop sources during initialization
			// This prevents the screen sharing permission dialog from appearing on startup
			await loadAudioDevices(true);

			// Fall back to microphone if system audio is selected but not available
			if (audioSourceType === 'system' && !systemAudioAvailable) {
				console.warn('[INIT-AUDIO] System audio selected but not available, falling back to microphone');
				audioSourceType = 'microphone';
				vadError = 'System audio not available. Please follow the setup instructions below or use microphone.';
			}
		}
	}

	// Initialize VAD separately
	async function initializeVAD() {
		console.log('[INIT-VAD] Initializing VAD...');
		isWasmLoading = true;

		// Initialize audio source manager if not already done
		await initializeAudioSourceManager();

		// Now load desktop sources if needed (user is actually starting to record)
		// This ensures desktop sources are only requested when user clicks record
		if (audioSourceType === 'system' && availableAudioDevices.length === 0) {
			console.log('[INIT-VAD] Loading desktop sources for system audio...');
			await loadAudioDevices(false); // Don't skip desktop sources this time
		}

		// Get custom audio stream based on selected source
		try {
			customAudioStream = await getAudioStream();
			console.log('[INIT-VAD] Got audio stream:', customAudioStream.getAudioTracks()[0].label);
		} catch (error: any) {
			console.error('[INIT-VAD] Failed to get audio stream:', error);
			vadError = `Failed to get audio stream: ${error.message}`;
			isWasmLoading = false;
			return;
		}

		vad = await MicVAD.new({
			// Provide pre-existing stream
			stream: customAudioStream,
			// Speech detection thresholds
			positiveSpeechThreshold: 0.5,  // Lowered from 0.6 for better sensitivity
			negativeSpeechThreshold: 0.35, // Lowered from 0.4
			preSpeechPadMs: 300, // 300ms pre-speech buffer
			redemptionMs: 250, // 250ms redemption time (equivalent to ~8 frames at 30fps)
			minSpeechMs: 100, // 100ms minimum speech duration (equivalent to ~3 frames at 30fps)

			// Callbacks
			onFrameProcessed: (probabilities: any, frame: Float32Array) => {
				// Ignore frames if recording was stopped
				if (!isRecording || !isVadActive) {
					return;
				}

				frameCount++;

				if (DEBUG_VAD) {
					// Log every frame for first 100 frames to debug initialization
					if (frameCount <= 100) {
						console.log(`[VAD] Frame #${frameCount} - prob: ${probabilities.isSpeech.toFixed(3)}, recording: ${isRecording}, speaking: ${isSpeaking}`);
					}
					// Then log periodically
					else if (frameCount % 50 === 0) {
						console.log(`[VAD] Frame #${frameCount} - still receiving frames`);
					}
				}

				// Always buffer frames for pre-speech
				audioBuffer.push(new Float32Array(frame));
				if (audioBuffer.length > FRAMES_TO_BUFFER) {
					audioBuffer.shift();
				}

				// Stream frame in real-time if speech is active
				if (isSpeaking) {
					sendAudioToASR(frame);
				}
			},

			onSpeechStart: () => {
				// Ignore if recording was stopped
				if (!isRecording || !isVadActive) {
					return;
				}

				if (DEBUG_VAD) console.log('🎤 [VAD] Speech started - sending pre-speech buffer');
				isSpeaking = true;

				// Clear the post-speech timer since speech resumed
				if (postSpeechTimer) {
					if (DEBUG_VAD) console.log('🎤 [VAD] Cancelling post-speech timer - speech resumed');
					clearTimeout(postSpeechTimer);
					postSpeechTimer = null;
				}

				// Clear the speech end timer since speech resumed
				if (speechEndTimer) {
					clearTimeout(speechEndTimer);
					speechEndTimer = null;
				}
				lastSpeechEndTime = null;

				// Send pre-speech buffer first
				for (const bufferedFrame of audioBuffer) {
					sendAudioToASR(bufferedFrame);
				}
				audioBuffer = [];
			},

			onSpeechEnd: (audio: Float32Array) => {
				if (DEBUG_VAD) console.log('🔇 [VAD] Speech ended, audio length:', audio.length);

				// Don't stop sending audio immediately - continue for POST_SPEECH_BUFFER_MS
				// This ensures trailing audio is still processed by ASR
				if (postSpeechTimer) {
					clearTimeout(postSpeechTimer);
				}
				postSpeechTimer = setTimeout(() => {
					if (DEBUG_VAD) console.log('🔇 [VAD] Post-speech buffer expired, stopping audio to ASR');
					isSpeaking = false;
					postSpeechTimer = null;
				}, POST_SPEECH_BUFFER_MS);

				// Clear any existing paragraph timer
				if (speechEndTimer) {
					clearTimeout(speechEndTimer);
				}

				// Only signal new paragraph after a significant pause (3 seconds)
				// This prevents creating paragraphs on short breaths/hesitations
				// DISABLED: Causes issues with ASR buffer deduplication across paragraphs
				lastSpeechEndTime = Date.now();
				speechEndTimer = setTimeout(() => {
					// Check if speech hasn't resumed in the last 3 seconds
					if (speechEditor && isRecording && lastSpeechEndTime) {
						const timeSinceSpeechEnd = Date.now() - lastSpeechEndTime;
						if (timeSinceSpeechEnd >= 3000) {
							// console.log('[VAD] Significant pause detected (3s+), signaling new paragraph');
							// speechEditor.signalVadSpeechEnd();
						}
					}
				}, 3000);

				// Note: We don't send utterance_end anymore
				// - For streaming models (ET/EN): Sessions should stay open across pauses
				// - For offline models (Parakeet): 15s buffer auto-processes without needing utterance_end
			},

			onVADMisfire: () => {
				if (DEBUG_VAD) console.log('⚠️ [VAD] VAD misfire detected');
				isSpeaking = false;
			},

			// Local asset paths
			workletURL: '/vad/vad.worklet.bundle.min.js',
			modelURL: '/vad/silero_vad_legacy.onnx',
			baseAssetPath: '/vad/',
			onnxWASMBasePath: '/onnx/',

			// Don't start yet - we'll start when user clicks record
			startOnLoad: false
		} as any);

		isWasmLoading = false;
		isWasmReady = true;
		console.log('[INIT-VAD] ✓ VAD initialized successfully');
	}

	// Initialize system: pre-load WASM and initialize local ASR
	async function initializeSystem() {
		try {
			console.log('[INIT] Starting system initialization...');

			// Step 1: Initialize local ASR (sherpa-onnx)
			if (window.asr) {
				initializationStatusKey = 'dictate.initializingASR';
				console.log('[INIT] Initializing local ASR...');

				// Listen for download progress
				window.asr.onDownloadProgress((progress) => {
					modelDownloadProgress = progress;
					isDownloadingModel = progress.overallProgress < 100;
				});

				const asrResult = await window.asr.initialize();

				if (!asrResult.success) {
					vadError = asrResult.error || $_('dictate.failedToInitializeASR');
					console.error('[INIT] Failed to initialize ASR:', asrResult.error);
					initializationStatusKey = 'dictate.initializationFailed';
					return;
				}

				asrInitialized = true;
				isConnected = true; // Keep for UI compatibility
				isDownloadingModel = false;
				console.log('[INIT] ✓ Local ASR initialized');
			} else {
				console.warn('[INIT] ASR API not available (not in Electron)');
				// In non-Electron environment, just skip ASR initialization
				isConnected = false;
			}

			// Step 2: Pre-load VAD WASM models
			initializationStatusKey = 'dictate.loadingVadModel';
			console.log('[INIT] Loading VAD WASM models...');

			await initializeVAD();

			initializationStatusKey = 'dictate.readyToRecord';
			console.log('[INIT] ✓ VAD WASM loaded successfully');
			console.log('[INIT] ✓ System initialized and ready to record');
		} catch (error: any) {
			console.error('[INIT] ❌ Failed to initialize system:', error);
			console.error('[INIT] Error details:', {
				name: error.name,
				message: error.message,
				stack: error.stack
			});
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

	// Start ASR session (replaces connectWebSocket)
	async function startASRSession() {
		if (!window.asr || !asrInitialized) {
			connectionError = $_('dictate.asrNotInitialized', { default: 'ASR not initialized' });
			return false;
		}

		try {
			connectionError = '';
			console.log('[ASR] Starting session...');

			const result = await window.asr.start();

			if (result.success) {
				asrSessionActive = true;
				sessionId = result.sessionId || null;
				isConnected = true; // Keep for UI compatibility
				console.log('[ASR] Session started:', sessionId);
				return true;
			} else {
				connectionError = result.error || $_('dictate.failedToStartASR');
				console.error('[ASR] Failed to start session:', result.error);
				return false;
			}
		} catch (error: any) {
			console.error('[ASR] Error starting session:', error);
			connectionError = error.message || $_('dictate.failedToStartASR');
			return false;
		}
	}

	// Stop ASR session (replaces disconnectWebSocket)
	async function stopASRSession() {
		if (!window.asr) return;

		try {
			console.log('[ASR] Stopping session...');
			const result = await window.asr.stop();

			// Handle final transcript if any
			if (result.text?.trim()) {
				handleTranscript_streaming({
					text: result.text,
					is_final: true
				});
			}

			asrSessionActive = false;
			sessionId = null;
			// Keep isConnected = true since ASR is still initialized
			console.log('[ASR] Session stopped');
		} catch (error) {
			console.error('[ASR] Error stopping session:', error);
			asrSessionActive = false;
			sessionId = null;
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// STREAMING MODEL HANDLERS (ET/EN)
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Handle transcript messages for streaming models (ET/EN).
	 * Streaming models return full hypothesis each time, so we replace the partial.
	 * Note: With local ASR, we won't receive [Session Ended] messages, but
	 * we keep this handler for the transcript processing logic.
	 */
	function handleTranscript_streaming(message: any) {
		// Insert into speech editor
		if (speechEditor && message.text.trim()) {
			speechEditor.insertStreamingText({
				text: message.text + ' ',
				isFinal: message.is_final,
				start: message.start,
				end: message.end
			});
		}

		// Keep old transcript display logic for compatibility
		if (message.is_final) {

			// Add to final transcript
			if (message.text.trim()) {
				transcript += (transcript ? ' ' : '') + message.text.trim();
			}
			partialTranscript = '';
		} else {
			// Show as partial transcript - REPLACE (full hypothesis)
			if (message.text.trim() || !partialTranscript) {
				partialTranscript = message.text;
			}
		}
	}

	/**
	 * Handle error messages for streaming models.
	 * Suppress "Session not found" during unexpected session transitions.
	 */
	function handleError_streaming(message: any) {
		// Suppress "Session not found" errors during session transitions
		// (can occur if server unexpectedly ends session due to timeout)
		if (message.message && message.message.includes('Session not found') && isRecording) {
			return;
		}

		connectionError = message.message;
	}

	/**
	 * Handle session ready for streaming models.
	 * Streaming sessions stay open continuously until user stops or timeout.
	 */
	function handleSessionReady_streaming(sessionIdReceived: string) {
		sessionId = sessionIdReceived;
	}

	/**
	 * Handle all server messages for streaming models (ET/EN).
	 */
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

	// ═══════════════════════════════════════════════════════════════
	// OFFLINE MODEL HANDLERS (PARAKEET)
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Handle transcript messages for offline models (Parakeet).
	 * Note: With local ASR (sherpa-onnx), offline models are not supported.
	 * This function is kept for compatibility but won't be called.
	 */
	function handleTranscript_offline(message: any) {
		// Local ASR only supports streaming models (ET/EN)
		// Route to streaming handler
		handleTranscript_streaming(message);
	}

	/**
	 * Handle error messages for offline models.
	 * Suppress "Session not found" errors during session transitions.
	 */
	function handleError_offline(message: any) {
		console.error('[OFFLINE] Server error:', message.message);

		// Check if error is "Session not found" during session chaining
		if (message.message && message.message.includes('Session not found') && isRecording) {
			console.log('[OFFLINE] Session not found (during session transition) - suppressing');
			return;
		}

		connectionError = message.message;
	}

	/**
	 * Handle session ready for offline models.
	 * Offline models chain sessions every 15 seconds during continuous recording.
	 */
	function handleSessionReady_offline(sessionIdReceived: string) {
		sessionId = sessionIdReceived;
		console.log('[OFFLINE] Session ready:', sessionId);
	}

	/**
	 * Handle all server messages for offline models (Parakeet).
	 */
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
				console.log('[OFFLINE] Session ended by server:', message.session_id);
				// Don't clear sessionId yet - keep it for audio sending during transition
				console.log('[OFFLINE] Keeping session ID for transition...');
				break;
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// SEND AUDIO TO LOCAL ASR
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Send audio samples to local ASR (sherpa-onnx via IPC).
	 * Replaces the old WebSocket-based sendAudio().
	 */
	async function sendAudioToASR(audioData: Float32Array) {
		if (!window.asr || !asrSessionActive) {
			return;
		}

		try {
			const result = await window.asr.sendAudio(audioData);

			if (result.error) {
				console.warn('[ASR] Audio processing error:', result.error);
				// If session died, try to restart
				if (result.error.includes('No active session') && isRecording) {
					console.log('[ASR] Session died, restarting...');
					await startASRSession();
				}
				return;
			}

			// Handle transcript result
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

	// Start recording with VAD (VAD already initialized, just start microphone)
	async function startRecording() {
		try {
			microphoneError = '';
			vadError = '';
			connectionError = '';

			console.log('[START] Starting recording...');

			// Check if ASR is initialized, and try to initialize if not
			if (!asrInitialized) {
				if (!window.asr) {
					console.error('[START] ASR API not available - are you running in Electron?');
					connectionError = $_('dictate.asrNotInitialized', { default: 'Speech recognition not available. Please ensure you are running the Electron app.' });
					return;
				}

				console.log('[START] ASR not initialized, attempting to initialize now...');
				connectionError = $_('dictate.initializingASR', { default: 'Initializing speech recognition...' });
				
				// Try to initialize ASR
				const asrResult = await window.asr.initialize();
				
				if (!asrResult.success) {
					const errorMsg = asrResult.error || $_('dictate.failedToInitializeASR', { default: 'Failed to initialize speech recognition' });
					console.error('[START] ASR initialization failed:', errorMsg);
					connectionError = errorMsg;
					return;
				}

				asrInitialized = true;
				isConnected = true;
				console.log('[START] ✓ ASR initialized successfully');
			}

			// Reinitialize VAD if it was destroyed
			// Always destroy and recreate VAD for fresh initialization
			// (MicVAD has timing issues if reused across multiple recordings)
			if (vad) {
				console.log('[START] Destroying previous VAD instance...');
				try {
					vad.destroy();
				} catch (e) {
					console.warn('[START] Error destroying VAD:', e);
				}
				vad = null;
			}

			console.log('[START] Creating fresh VAD instance...');
			isWasmReady = false;
			await initializeVAD();

			// Ensure VAD is ready
			if (!isWasmReady || !vad) {
				vadError = $_('dictate.failedToInitializeVoiceDetection');
				console.error('[START] VAD initialization failed');
				return;
			}

			// Start ASR session
			console.log('[START] Starting ASR session...');
			const sessionStarted = await startASRSession();
			if (!sessionStarted) {
				console.error('[START] Failed to start ASR session');
				return;
			}

			// Reset frame counter for this recording session
			frameCount = 0;
			console.log('[START] Frame counter reset to 0');

			// Start the already-initialized VAD (requests microphone access)
			console.log('[START] Calling vad.start()...');
			console.log('[START] Frame count before start:', frameCount);
			if (!vad) {
				throw new Error('VAD is not initialized');
			}
			const vadInstance: MicVAD = vad as MicVAD;
			await vadInstance.start();
			console.log('[START] vad.start() completed');

			isVadActive = true;
			isRecording = true;

			// Start timing tracking for word timestamps
			speechEditor?.startTiming();

			// Signal new paragraph if resuming recording (editor has content from previous session)
			// This is safe because startRecording sends a 'start' message that clears ASR buffer
			if (speechEditor?.hasContent()) {
				console.log('[START] Resuming recording - creating new paragraph');
				speechEditor.signalVadSpeechEnd();
			}

			// Verify microphone is working by checking if we have an audio stream
			// MicVAD stores the stream internally, but we can check via callbacks
			console.log('[START] ✓ Recording started. Waiting for first audio frame...');
			console.log('[START] State: isRecording =', isRecording, 'isVadActive =', isVadActive, 'isSpeaking =', isSpeaking);

			// Diagnostic: Check if we're receiving audio frames (doesn't stop recording)
			setTimeout(() => {
				if (isRecording) {
					console.log('[START] Frame count after 3s:', frameCount);
					if (audioBuffer.length === 0 && frameCount === 0) {
						console.error('[START] ❌ No audio frames received - VAD is not processing audio!');
						console.error('[START] This indicates microphone permission issue or worklet not loaded.');
					} else if (audioBuffer.length === 0 && frameCount > 0) {
						console.warn('[START] ⚠️ Frames processed but buffer empty (frames:', frameCount, ')');
					} else {
						console.log('[START] ✓ VAD working! Received', audioBuffer.length, 'audio frames, processed', frameCount, 'total frames.');
					}
				}
			}, 3000);
		} catch (error: any) {
			console.error('[START] ❌ Failed to start recording:', error);
			console.error('[START] Error details:', {
				name: error.name,
				message: error.message,
				stack: error.stack
			});

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

	// Stop recording
	async function stopRecording() {
		isRecording = false;
		isVadActive = false;
		isSpeaking = false;

		// Clear post-speech timer
		if (postSpeechTimer) {
			clearTimeout(postSpeechTimer);
			postSpeechTimer = null;
		}

		// Notify editor that recording ended (for final segment emission)
		if (speechEditor && speechEditor.view) {
			const tr = speechEditor.view.state.tr;
			tr.setMeta('recordingEnded', true);
			speechEditor.view.dispatch(tr);
		}

		// Stop timing tracking
		speechEditor?.stopTiming();

		// Pause and destroy VAD - will be recreated on next start
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

		// Clear audio buffer for next recording
		audioBuffer = [];

		// Stop ASR session and get final transcript
		await stopASRSession();

		// Small delay for UI to settle
		await new Promise(resolve => setTimeout(resolve, 500));
	}

	// Clear transcript
	function clearTranscript() {
		transcript = '';
		partialTranscript = '';
	}

	// Download transcript
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

	// Initialize on component mount
	onMount(async () => {
		await initializeSystem();

		// Restore saved audio preferences
		if (window.electronAPI) {
			const savedType = await window.electronAPI.getSetting('audio_source_type');
			const savedDeviceId = await window.electronAPI.getSetting('audio_device_id');

			if (savedType) {
				audioSourceType = savedType as AudioSourceType;
				console.log('[AUDIO] Restored audio source type:', audioSourceType);
				// Reload device list for the restored type, but skip desktop sources on init
				await loadAudioDevices(true);
			}
			if (savedDeviceId) {
				// Only restore device ID if it exists in the available devices
				const deviceExists = availableAudioDevices.some(d => d.deviceId === savedDeviceId);
				if (deviceExists) {
					selectedDeviceId = savedDeviceId;
					console.log('[AUDIO] Restored device ID:', selectedDeviceId);
				} else {
					// Device no longer available, default to null (Default)
					selectedDeviceId = null;
					console.log('[AUDIO] Saved device not found, using default');
				}
			}
		}

		// Check for URL parameters
		if (browser) {
			const urlParams = new URLSearchParams(window.location.search);

			// Check for session ID (from Sessions page)
			const sessionId = urlParams.get('session');
			if (sessionId) {
				// Load and activate session from database
				setTimeout(async () => {
					await startCollaborativeSession(sessionId);
				}, 500);
			}

			// Check for join code (from external link)
			const joinCode = urlParams.get('join');
			if (joinCode && !sessionId) {
				joinSessionCode = joinCode;
				// Auto-join after a short delay to ensure editor is ready
				setTimeout(() => {
					if (joinSessionCode) {
						joinCollaborativeSession(joinSessionCode);
					}
				}, 500);
			}
		}

		// Listen for deep link join events from Electron
		if (typeof window !== 'undefined' && window.electronAPI?.onDeepLinkJoin) {
			window.electronAPI.onDeepLinkJoin((sessionCode) => {
				console.log('[Deep Link] Received join request for session:', sessionCode);
				joinSessionCode = sessionCode;
				// Auto-join after a short delay to ensure editor is ready
				setTimeout(() => {
					if (joinSessionCode) {
						joinCollaborativeSession(joinSessionCode);
					}
				}, 500);
			});
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		stopRecording();

		// Destroy VAD on unmount
		if (vad) {
			try {
				vad.destroy();
				vad = null;
			} catch (error) {
				console.error('Error destroying VAD on unmount:', error);
			}
		}

		// Clean up ASR download progress listener
		if (window.asr) {
			window.asr.removeDownloadProgressListener();
		}
	});
</script>

<svelte:head>
	<title>{$_('dictate.pageTitle')} | Jutukuva</title>
</svelte:head>

<!-- Model Download Progress Modal -->
{#if isDownloadingModel && modelDownloadProgress}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-base-100 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
			<h3 class="text-lg font-semibold mb-4">
				{$_('dictate.downloadingModel', { default: 'Downloading speech recognition model...' })}
			</h3>
			<div class="space-y-3">
				<!-- Overall progress bar -->
				<div>
					<div class="flex justify-between text-sm mb-1">
						<span>{$_('dictate.overallProgress', { default: 'Overall progress' })}</span>
						<span>{modelDownloadProgress.overallProgress}%</span>
					</div>
					<div class="w-full bg-base-300 rounded-full h-3">
						<div
							class="bg-primary h-3 rounded-full transition-all duration-300"
							style="width: {modelDownloadProgress.overallProgress}%"
						></div>
					</div>
				</div>
				<!-- Current file -->
				<div class="text-sm text-base-content/70">
					<p>
						{$_('dictate.downloadingFile', { default: 'Downloading' })}: {modelDownloadProgress.currentFile}
					</p>
					<p class="text-xs mt-1">
						{$_('dictate.fileProgress', {
							default: 'File {completed} of {total}',
							values: {
								completed: modelDownloadProgress.completedFiles + 1,
								total: modelDownloadProgress.totalFiles
							}
						})}
					</p>
				</div>
			</div>
			<p class="text-xs text-base-content/50 text-center mt-4">
				{$_('dictate.downloadOnce', { default: 'This only needs to be done once.' })}
			</p>
		</div>
	</div>
{/if}

<div class="flex flex-col bg-base-100">
	<!-- Toolbar -->
	<div class="navbar bg-base-100 border-b border-base-200 shrink-0 z-20">
		<div class="grid grid-cols-3 w-full items-center gap-4">
			<!-- Left: Logo & Status -->
			<div class="flex items-center gap-3">
								
			<!-- Status Badge -->
			{#if connectionError}
				<div class="badge badge-error gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<span class="truncate max-w-[200px]">{connectionError}</span>
					<button class="btn btn-ghost btn-xs btn-circle" onclick={() => connectionError = ''}>✕</button>
				</div>
			{:else if isRecording}
				<div class="badge badge-error gap-2 animate-pulse">
					<div class="w-2 h-2 rounded-full bg-white shrink-0"></div>
					<span class="truncate max-w-[200px]">{isSpeaking ? $_('dictate.speakingDetected') : $_('dictate.listeningForSpeech')}</span>
				</div>
			{:else if isWasmLoading || !isWasmReady}
				<div class="badge badge-info gap-2">
					<span class="loading loading-spinner loading-xs shrink-0"></span>
					<span class="truncate max-w-[200px]">{initializationStatus}</span>
				</div>
			{:else if isWasmReady && isConnected}
				<div class="badge badge-success badge-outline gap-2">
					<div class="w-2 h-2 rounded-full bg-success shrink-0"></div>
					<span class="truncate max-w-[200px]">{initializationStatus}</span>
				</div>
			{/if}

				{#if sessionInfo}
					<div class="badge badge-secondary gap-2">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
						</svg>
						{sessionInfo.code}
						<button
							class="hover:text-white transition-colors cursor-pointer"
							onclick={() => {
								navigator.clipboard.writeText(sessionInfo.code);
							}}
							title={$_('share_session.copy')}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
						</button>
					</div>
				{/if}
			</div>

			<!-- Center: Recording Control -->
			<div class="flex justify-center">
				{#if !isRecording}
					<button
						class="btn btn-circle btn-primary btn-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
						onclick={startRecording}
						disabled={!isWasmReady || (sessionInfo?.role === 'guest')}
						title={sessionInfo?.role === 'guest' ? $_('collaboration.guest_cannot_record') : $_('dictate.startRecording')}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
						</svg>
					</button>
				{:else}
					<button class="btn btn-circle btn-error btn-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200" onclick={stopRecording}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
						</svg>
					</button>
				{/if}
			</div>

			<!-- Right: Tools -->
			<div class="flex justify-end items-center gap-2">
				<!-- Collaboration Menu -->
				<div class="dropdown dropdown-end">
					<div tabindex="0" role="button" class="btn btn-ghost btn-circle hover:bg-base-200 transition-colors" title={$_('collaboration.collaborative_session')} onfocus={() => loadCollaborationSessions()}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
						</svg>
					</div>
					<ul tabindex="0" class="dropdown-content z-[1] menu p-3 shadow-xl bg-base-100 rounded-box w-80 border border-base-300 mt-2 max-h-[70vh] overflow-y-auto">
						{#if !sessionInfo}
							<li><h3 class="menu-title text-sm font-semibold">{$_('collaboration.collaborative_session')}</h3></li>
							<li>
								<button class="gap-3 cursor-pointer" onclick={() => startCollaborativeSession()}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
									</svg>
									{$_('collaboration.start_session')}
								</button>
							</li>
							<li class="menu-title mt-3 text-sm font-semibold">{$_('collaboration.join_existing')}</li>
							<li class="p-2">
								<div class="join w-full p-0">
									<input
										type="text"
										placeholder={$_('collaboration.enter_code')}
										class="input input-sm input-bordered join-item w-full font-mono uppercase"
										maxlength="6"
										bind:value={joinSessionCode}
										oninput={(e) => { joinSessionCode = e.currentTarget.value.toUpperCase(); }}
										onkeydown={(e) => { if (e.key === 'Enter' && joinSessionCode.length === 6) joinCollaborativeSession(joinSessionCode); }}
									/>
									<button
										class="btn btn-sm btn-secondary join-item"
										disabled={joinSessionCode.length !== 6}
										onclick={() => joinCollaborativeSession(joinSessionCode)}
									>
										{$_('collaboration.join')}
									</button>
								</div>
							</li>

							<!-- Planned & Active Sessions -->
							{#if plannedAndActiveSessions.length > 0 || isLoadingSessions}
								<div class="divider my-2"></div>
								<li class="menu-title text-sm font-semibold">{$_('collaboration.your_sessions')}</li>
								{#if isLoadingSessions}
									<li class="p-2">
										<div class="flex justify-center">
											<span class="loading loading-spinner loading-sm"></span>
										</div>
									</li>
								{:else}
									{#each plannedAndActiveSessions.slice(0, 5) as session (session.id)}
										<li>
											<button class="flex flex-col items-start gap-0.5 py-2 cursor-pointer" onclick={() => startCollaborativeSession(session.id)}>
												<div class="flex items-center gap-2 w-full">
													<span class="font-medium text-sm truncate flex-1 text-left">{session.name}</span>
													<span class={`badge badge-xs ${session.status === 'active' ? 'badge-success' : 'badge-info'}`}>
														{$_(`sessions.status.${session.status}`)}
													</span>
												</div>
												<div class="flex items-center gap-3 text-xs opacity-70 w-full">
													{#if session.session_code}
														<span class="font-mono">{session.session_code}</span>
													{/if}
													{#if session.scheduled_date}
														<span>{new Date(session.scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
													{:else}
														<span>{new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
													{/if}
												</div>
											</button>
										</li>
									{/each}
								{/if}
							{/if}

							<div class="divider my-2"></div>
							<li>
								<button class="gap-3 cursor-pointer" onclick={() => modalStore.openSessions()}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
									{$_('collaboration.manage_sessions')}
								</button>
							</li>
						{:else}
							<li><h3 class="menu-title text-sm font-semibold">{$_('collaboration.session_active')}</h3></li>
							<li>
								<div class="flex flex-col items-start gap-1 cursor-default hover:bg-transparent p-3">
									<span class="text-xs opacity-70">{$_('share_session.code_label')}</span>
									<div class="flex items-center gap-2">
										<span class="font-mono text-lg font-bold select-all">{sessionInfo.code}</span>
										<button
											class="btn btn-ghost btn-xs btn-circle cursor-pointer"
											onclick={() => navigator.clipboard.writeText(sessionInfo.code)}
											title={$_('share_session.copy')}
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
											</svg>
										</button>
									</div>
								</div>
							</li>
							<li>
								<button class="gap-3 cursor-pointer" onclick={() => (showShareModal = true)}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
									</svg>
									{$_('collaboration.share_session')}
								</button>
							</li>
							<li>
								<button class="text-error gap-3 cursor-pointer" onclick={() => (showEndSessionModal = true)}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
									</svg>
									{$_('collaboration.end_session')}
								</button>
							</li>
						{/if}
					</ul>
				</div>

				<!-- Settings Menu -->
				<div class="dropdown dropdown-end">
					<div tabindex="0" role="button" class="btn btn-ghost btn-circle hover:bg-base-200 transition-colors" title={$_('dictate.audioSource')}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</div>
					<ul tabindex="0" class="dropdown-content z-[1] menu p-3 shadow-xl bg-base-100 rounded-box w-72 border border-base-300 mt-2">
						<li><h3 class="menu-title text-sm font-semibold">{$_('dictate.audioSource')}</h3></li>
						
						<!-- Source Type -->
						<li class="mb-2">
							<select
								class="select select-bordered select-sm w-full"
								bind:value={audioSourceType}
								onchange={() => switchAudioSource(audioSourceType, selectedDeviceId)}
								disabled={isAudioSourceSwitching || !isWasmReady}
							>
								<option value="microphone">🎤 {$_('dictate.audioSourceMicrophone')}</option>
								{#if systemAudioAvailable}
									<option value="system">🔊 {$_('dictate.audioSourceSystem')}</option>
								{/if}
							</select>
						</li>

						<!-- Device Selection -->
						{#if availableAudioDevices.length > 0 || audioSourceType === 'system'}
							<li><h3 class="menu-title text-xs opacity-70 mt-2">
								{audioSourceType === 'system' && availableAudioDevices.some(d => d.kind === 'desktop')
									? $_('dictate.captureSource')
									: $_('dictate.device')}
							</h3></li>
							<li>
								<select
									class="select select-bordered select-sm w-full"
									bind:value={selectedDeviceId}
									onchange={() => switchAudioSource(audioSourceType, selectedDeviceId)}
									disabled={isAudioSourceSwitching || !isWasmReady}
								>
									<option value={null}>{$_('dictate.deviceDefault')}</option>
									{#each availableAudioDevices as device}
										<option value={device.deviceId}>{device.label}</option>
									{/each}
								</select>
							</li>
						{/if}

						<!-- Switching Indicator -->
						{#if isAudioSourceSwitching}
							<li class="mt-2 text-center text-xs opacity-50">
								<span class="loading loading-spinner loading-xs"></span>
								<span>Switching...</span>
							</li>
						{/if}
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Error Messages Overlay -->
	<div class="absolute top-20 left-0 right-0 z-10 px-4 pointer-events-none flex flex-col items-center gap-3">
		{#if microphoneError}
			<div class="alert alert-warning shadow-xl max-w-lg pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-300">
				<div class="flex gap-3 items-center flex-1">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
					<span class="text-sm">{microphoneError}</span>
				</div>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={() => microphoneError = ''}>✕</button>
			</div>
		{/if}
		{#if vadError}
			<div class="alert alert-error shadow-xl max-w-lg pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-300">
				<div class="flex gap-3 items-center flex-1">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
					<span class="text-sm">{vadError}</span>
				</div>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={() => vadError = ''}>✕</button>
			</div>
		{/if}
		
		<!-- macOS Setup Guide (if needed) -->
		{#if audioSourceType === 'system' && !systemAudioAvailable && audioSourceManager}
			{@const setupInstructions = audioSourceManager.getSetupInstructions()}
			<div class="alert alert-warning shadow-xl max-w-lg pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-300">
				<div class="flex flex-col gap-2 w-full">
					<h3 class="font-bold text-sm">{setupInstructions.title}</h3>
					<ol class="list-decimal list-inside space-y-1 text-xs">
						{#each setupInstructions.steps as step}
							<li>{step}</li>
						{/each}
					</ol>
				</div>
				<button class="btn btn-ghost btn-sm btn-circle absolute top-2 right-2" onclick={() => audioSourceType = 'microphone'}>✕</button>
			</div>
		{/if}
	</div>

	<!-- Main Content: Editor -->
	<div class=" relative">
		<div class=" w-full overflow-y-auto">
			<div>
				{#key sessionInfo?.code || 'solo'}
					<SpeechEditor
						bind:this={speechEditor}
						collaborationManager={collaborationManager}
						config={{
							fontSize: 16,
							onSubtitleEmit: handleSubtitleEmit
						}}
					/>
				{/key}
			</div>
		</div>
	</div>
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
/>
