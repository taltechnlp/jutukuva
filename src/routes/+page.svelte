<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { MicVAD } from '@ricky0123/vad-web';
	import * as ort from 'onnxruntime-web';
	import { SpeechEditor, SubtitlePreview } from '$lib/components/prosemirror-speech';
	import type { SubtitleSegment, Word } from '$lib/components/prosemirror-speech/utils/types';
	import { AudioSourceManager, type AudioSourceType, type AudioDevice } from '$lib/audioSourceManager';

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
	const WS_URL = 'wss://tekstiks.ee/asr/v2';
	const DEBUG_VAD = false; // Set to true to enable verbose VAD logging

	// WebSocket connection
	let ws: WebSocket | null = null;
	let sessionId: string | null = null;

	// VAD instance
	let vad: MicVAD | null = null;
	let isVadActive = $state(false);
	let isSpeaking = $state(false);

	// Audio source management
	let audioSourceManager = $state<AudioSourceManager | null>(null);
	let audioSourceType = $state<AudioSourceType>('microphone');
	let selectedDeviceId = $state<string | null>(null);
	let availableAudioDevices = $state<AudioDevice[]>([]);
	let systemAudioAvailable = $state(false);
	let isAudioSourceSwitching = $state(false);
	let customAudioStream: MediaStream | null = null;

	// Pre-speech circular buffer
	const PRE_SPEECH_BUFFER_MS = 300; // 300ms pre-speech buffer
	const FRAME_SIZE = 1536; // VAD frame size at 16kHz
	const FRAMES_TO_BUFFER = Math.ceil((PRE_SPEECH_BUFFER_MS / 1000) * SAMPLE_RATE / FRAME_SIZE);
	let audioBuffer: Float32Array[] = [];
	let frameCount = 0; // Track total frames received for debugging

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

	// Past recordings
	interface Recording {
		id: string;
		text: string;
		timestamp: Date;
	}
	let pastRecordings = $state<Recording[]>([]);

	// Format timestamp for display
	function formatTimestamp(date: Date): string {
		return date.toLocaleString(undefined, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	// Copy text to clipboard
	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			console.error('Failed to copy text:', error);
		}
	}

	// Delete a past recording
	function deleteRecording(id: string) {
		pastRecordings = pastRecordings.filter((r) => r.id !== id);
	}

	// Handle word approved
	function handleWordApproved(word: Word) {
		console.log('[WORD] Approved:', word);
	}

	// Handle subtitle segment emitted
	function handleSubtitleEmit(srt: string, segment: SubtitleSegment) {
		console.log('[SUBTITLE] Emitted:', srt);
		subtitleSegments = [...subtitleSegments, segment];
		// TODO: Send subtitle to streaming endpoint or WebSocket
	}

	// Audio source management functions
	async function loadAudioDevices() {
		if (!audioSourceManager) return;
		try {
			availableAudioDevices = await audioSourceManager.enumerateAudioDevices();
			console.log('[AUDIO] Found', availableAudioDevices.length, 'audio devices');
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

	async function switchAudioSource(newType: AudioSourceType, deviceId: string | null = null) {
		if (!audioSourceManager || isAudioSourceSwitching) return;

		console.log(`[AUDIO] Switching to ${newType}`, deviceId);
		isAudioSourceSwitching = true;
		vadError = '';

		try {
			// If recording, need to restart VAD
			if (isRecording) {
				console.log('[AUDIO] Recording active, restarting with new source...');

				// Stop current recording
				await stopRecording();

				// Update source
				audioSourceType = newType;
				selectedDeviceId = deviceId;

				// Clear custom stream so getAudioStream will fetch new one
				if (customAudioStream) {
					customAudioStream.getTracks().forEach(track => track.stop());
					customAudioStream = null;
				}

				// Wait for cleanup
				await new Promise(r => setTimeout(r, 300));

				// Restart with new source
				await startRecording();
			} else {
				// Just update the selection for next recording
				audioSourceType = newType;
				selectedDeviceId = deviceId;

				// Clear any cached stream
				if (customAudioStream) {
					customAudioStream.getTracks().forEach(track => track.stop());
					customAudioStream = null;
				}
			}

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

	// Initialize VAD separately
	async function initializeVAD() {
		console.log('[INIT-VAD] Initializing VAD...');
		isWasmLoading = true;

		// Initialize audio source manager
		audioSourceManager = new AudioSourceManager();
		await audioSourceManager.initialize();

		// Check system audio availability
		systemAudioAvailable = await audioSourceManager.checkSystemAudioSupport();
		console.log('[INIT-VAD] System audio available:', systemAudioAvailable);

		// Load available audio devices
		await loadAudioDevices();

		// Fall back to microphone if system audio is selected but not available
		if (audioSourceType === 'system' && !systemAudioAvailable) {
			console.warn('[INIT-VAD] System audio selected but not available, falling back to microphone');
			audioSourceType = 'microphone';
			vadError = 'System audio not available. Please follow the setup instructions below or use microphone.';
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
					sendAudio(frame);
				}
			},

			onSpeechStart: () => {
				// Ignore if recording was stopped
				if (!isRecording || !isVadActive) {
					return;
				}

				if (DEBUG_VAD) console.log('🎤 [VAD] Speech started - sending pre-speech buffer');
				isSpeaking = true;

				// Send pre-speech buffer first
				for (const bufferedFrame of audioBuffer) {
					sendAudio(bufferedFrame);
				}
				audioBuffer = [];
			},

			onSpeechEnd: (audio: Float32Array) => {
				if (DEBUG_VAD) console.log('🔇 [VAD] Speech ended, audio length:', audio.length);
				isSpeaking = false;

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

	// Initialize system: pre-load WASM and connect WebSocket
	async function initializeSystem() {
		try {
			console.log('[INIT] Starting system initialization...');

			// Step 1: Connect to WebSocket
			initializationStatusKey = 'dictate.connectingToServer';
			console.log('[INIT] Connecting to WebSocket:', WS_URL);
			await connectWebSocket();
			await new Promise((resolve) => setTimeout(resolve, 500));

			if (!isConnected) {
				vadError = $_('dictate.failedToConnect');
				console.error('[INIT] Failed to connect to WebSocket server');
				return;
			}
			console.log('[INIT] ✓ WebSocket connected');

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

	// Connect to WebSocket server
	async function connectWebSocket() {
		try {
			connectionError = '';
			ws = new WebSocket(WS_URL);

			ws.onopen = () => {
				console.log('WebSocket connected');
				isConnected = true;
			};

			ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data);
					handleServerMessage(message);
				} catch (e) {
					console.error('Failed to parse server message:', e);
				}
			};

			ws.onclose = () => {
				console.log('WebSocket disconnected');
				isConnected = false;
				sessionId = null;
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
				connectionError = $_('dictate.noConnections');
				isConnected = false;
			};
		} catch (error) {
			console.error('Failed to connect:', error);
			connectionError = $_('dictate.noConnections');
		}
	}

	// Disconnect WebSocket
	function disconnectWebSocket() {
		if (ws) {
			ws.close();
			ws = null;
		}
		isConnected = false;
		sessionId = null;
	}

	// ═══════════════════════════════════════════════════════════════
	// STREAMING MODEL HANDLERS (ET/EN)
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Handle transcript messages for streaming models (ET/EN).
	 * Streaming models return full hypothesis each time, so we replace the partial.
	 */
	function handleTranscript_streaming(message: any) {
		console.log('[STREAMING] Received transcript:', message.text, 'is_final:', message.is_final);

		// Check for unexpected session end BEFORE inserting into editor
		if (message.is_final && message.text.trim() === '[Session Ended]') {
			console.warn('[STREAMING] ⚠️  Server ended session unexpectedly (possibly timeout). NOT inserting into editor.');
			// Save the partial transcript to final before starting new session
			if (partialTranscript.trim()) {
				transcript += (transcript ? ' ' : '') + partialTranscript.trim();
			}
			partialTranscript = '';

			// Clear old session ID immediately so audio won't be sent until new session is ready
			sessionId = null;

			// If still recording, start a new session immediately
			if (isRecording) {
				const language = isOfflineModel(selectedLanguage) ? 'parakeet_tdt_v3' : selectedLanguage;
				console.log('[STREAMING] Sending new start message with language:', language);
				sendMessage({
					type: 'start',
					sample_rate: SAMPLE_RATE,
					format: 'pcm',
					language: language
				});
			}
			return;
		}

		// Insert into speech editor (after checking for session end)
		console.log('[STREAMING] Attempting to insert into editor, speechEditor:', !!speechEditor, 'text length:', message.text.length);
		if (speechEditor && message.text.trim()) {
			console.log('[STREAMING] Calling speechEditor.insertStreamingText');
			speechEditor.insertStreamingText({
				text: message.text + ' ',
				isFinal: message.is_final,
				start: message.start,
				end: message.end
			});
		} else {
			console.warn('[STREAMING] Not inserting - speechEditor:', !!speechEditor, 'text.trim():', !!message.text.trim());
		}

		// Keep old transcript display logic for compatibility
		if (message.is_final) {

			// Add to final transcript
			if (message.text.trim()) {
				console.log('[STREAMING] Adding to final transcript:', message.text.trim());
				transcript += (transcript ? ' ' : '') + message.text.trim();
			}
			partialTranscript = '';
		} else {
			// Show as partial transcript - REPLACE (full hypothesis)
			if (message.text.trim() || !partialTranscript) {
				partialTranscript = message.text;
			} else {
				console.log('[STREAMING] Ignoring empty partial transcript - keeping existing text');
			}
		}
	}

	/**
	 * Handle error messages for streaming models.
	 * Suppress "Session not found" during unexpected session transitions.
	 */
	function handleError_streaming(message: any) {
		console.error('[STREAMING] Server error:', message.message);

		// Suppress "Session not found" errors during session transitions
		// (can occur if server unexpectedly ends session due to timeout)
		if (message.message && message.message.includes('Session not found') && isRecording) {
			console.log('[STREAMING] Session not found (during session transition) - suppressing');
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
		console.log('[STREAMING] Session ready:', sessionId);
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
				console.log('[STREAMING] Session ended by server:', message.session_id);
				sessionId = null;
				break;
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// OFFLINE MODEL HANDLERS (PARAKEET)
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Handle transcript messages for offline models (Parakeet).
	 * Offline models give incremental text across sessions, so we concatenate.
	 */
	function handleTranscript_offline(message: any) {
		console.log('[OFFLINE] Received transcript:', message.text, 'is_final:', message.is_final);

		if (message.is_final) {
			// Check if server is ending the session (15-second buffer limit)
			if (message.text.trim() === '[Session Ended]') {
				console.log('[OFFLINE] Server ended session (15s buffer). Starting new session...');
				// Save the partial transcript to final before starting new session
				if (partialTranscript.trim()) {
					transcript += (transcript ? ' ' : '') + partialTranscript.trim();
				}
				partialTranscript = '';

				// DON'T clear sessionId - keep it until new 'ready' arrives so audio can continue
				// sessionId will be updated when the new 'ready' message arrives

				// If still recording, start a new session immediately
				if (isRecording) {
					const language = isOfflineModel(selectedLanguage) ? 'parakeet_tdt_v3' : selectedLanguage;
					console.log('[OFFLINE] Sending new start message with language:', language);
					sendMessage({
						type: 'start',
						sample_rate: SAMPLE_RATE,
						format: 'pcm',
						language: language
					});
				}
				return;
			}

			// Add to final transcript
			if (message.text.trim()) {
				console.log('[OFFLINE] Adding to final transcript:', message.text.trim());
				transcript += (transcript ? ' ' : '') + message.text.trim();
			}
			partialTranscript = '';
		} else {
			// Show as partial transcript
			console.log('[OFFLINE] Setting partial transcript:', message.text);

			// For offline models: finalize previous partial before setting new one
			// (text is incremental across sessions)
			if (isRecording && partialTranscript.trim() && message.text.trim()) {
				console.log('[OFFLINE] Finalizing previous partial before new partial (session chaining)');
				transcript += (transcript ? ' ' : '') + partialTranscript.trim();
			}

			if (message.text.trim() || !partialTranscript) {
				partialTranscript = message.text;
			} else {
				console.log('[OFFLINE] Ignoring empty partial transcript - keeping existing text');
			}
		}
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
	// MAIN MESSAGE HANDLER (DELEGATES TO STREAMING OR OFFLINE)
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Main server message handler - delegates to streaming or offline handlers.
	 */
	function handleServerMessage(message: any) {
		console.log('Received message:', message);

		// Delegate to appropriate handler based on model type
		if (isOfflineModel(selectedLanguage)) {
			handleServerMessage_offline(message);
		} else {
			handleServerMessage_streaming(message);
		}
	}

	// Send WebSocket message
	function sendMessage(message: any) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	// Convert Float32Array to Int16Array
	function float32ToInt16(float32Array: Float32Array): Int16Array {
		const int16Array = new Int16Array(float32Array.length);
		for (let i = 0; i < float32Array.length; i++) {
			const s = Math.max(-1, Math.min(1, float32Array[i]));
			int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}
		return int16Array;
	}

	// Send audio to server
	function sendAudio(audioData: Float32Array) {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		// Don't send audio if session has ended
		if (!sessionId) {
			console.warn('[AUDIO] Skipping audio send - no active session');
			return;
		}

		// Convert Float32 to Int16
		const int16Data = float32ToInt16(audioData);
		const bytes = new Uint8Array(int16Data.buffer);

		// Convert to base64 without using apply (avoids stack overflow)
		let binary = '';
		const len = bytes.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		const base64 = btoa(binary);

		sendMessage({
			type: 'audio',
			data: base64
		});
	}

	// Start recording with VAD (VAD already initialized, just start microphone)
	async function startRecording() {
		try {
			microphoneError = '';
			vadError = '';

			console.log('[START] Starting recording...');

			if (!isConnected || !ws) {
				connectionError = $_('dictate.noConnections');
				console.error('[START] Not connected to server');
				return;
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

			// Send start message to establish session
			// ET and EN use dedicated models, all others use Parakeet (auto LID)
			const offline = isOfflineModel(selectedLanguage);
			const language = offline ? 'parakeet_tdt_v3' : selectedLanguage;
			const modelType = offline ? 'OFFLINE' : 'STREAMING';
			console.log(`[START] [${modelType}] Sending start message with language:`, language);
			sendMessage({
				type: 'start',
				sample_rate: SAMPLE_RATE,
				format: 'pcm',
				language: language
			});

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
		console.log('[STOP] Stopping recording...');
		isRecording = false;
		isVadActive = false;
		isSpeaking = false;

		// Stop timing tracking
		speechEditor?.stopTiming();

		// Pause and destroy VAD - will be recreated on next start
		if (vad) {
			try {
				console.log('[STOP] Pausing VAD...');
				const vadInstance: MicVAD = vad as MicVAD;
				await vadInstance.pause();
				console.log('[STOP] ✓ VAD paused');

				console.log('[STOP] Destroying VAD...');
				vad.destroy();
				console.log('[STOP] ✓ VAD destroyed');
				vad = null;
			} catch (error) {
				console.error('[STOP] Error stopping VAD:', error);
			}
		}

		// Clear audio buffer for next recording
		audioBuffer = [];

		// Send stop message
		if (ws && ws.readyState === WebSocket.OPEN && sessionId) {
			console.log('[STOP] Sending stop message to server');
			sendMessage({ type: 'stop' });
		}

		// Wait longer for final results from offline models
		// Server needs time to process remaining buffer (< 15s) before finalizing
		const isOffline = isOfflineModel(selectedLanguage);
		const waitTime = isOffline ? 3000 : 1000; // 3s for offline, 1s for streaming
		console.log(`[STOP] Waiting ${waitTime}ms for final transcription results...`);
		await new Promise(resolve => setTimeout(resolve, waitTime));

		// Combine final and partial transcripts
		const finalText = (transcript + ' ' + partialTranscript).trim();

		if (finalText) {
			console.log('[STOP] Saving recording to past recordings:', finalText);
			const newRecording: Recording = {
				id: Date.now().toString(),
				text: finalText,
				timestamp: new Date()
			};
			pastRecordings = [newRecording, ...pastRecordings];
			console.log('[STOP] ✓ Saved. Past recordings count:', pastRecordings.length);
			transcript = '';
			partialTranscript = '';
		} else {
			console.log('[STOP] No transcript to save (empty)');
		}
		console.log('[STOP] Recording stopped');
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
			}
			if (savedDeviceId) {
				selectedDeviceId = savedDeviceId;
				console.log('[AUDIO] Restored device ID:', selectedDeviceId);
			}
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

		disconnectWebSocket();
	});
</script>

<svelte:head>
	<title>Kirjutustõlk | tekstiks.ee</title>
</svelte:head>

<div class="bg-base-100">
	<div class="container mx-auto px-4 py-8 max-w-4xl">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-4xl font-bold mb-4">Kirjutustõlk</h1>
		<div class="prose max-w-none">
			<p class="mb-2">{$_('dictate.intro1')}</p>
			<p class="mb-2">{$_('dictate.intro2')}</p>
			<p class="mb-4">{$_('dictate.intro3')}</p>
		</div>
	</div>

	<!-- Error Messages -->
	{#if connectionError}
		<div class="alert alert-error mb-6">
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
			<span>{connectionError}</span>
		</div>
	{/if}

	{#if microphoneError}
		<div class="alert alert-warning mb-6">
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
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span>{microphoneError}</span>
		</div>
	{/if}

	{#if vadError}
		<div class="alert alert-error mb-6">
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
			<span>{vadError}</span>
		</div>
	{/if}

	<!-- Recording Controls -->
	<div class="card bg-base-200 shadow-xl mb-6 relative">
		<div class="card-body">
			<!-- Status Badge - Top Right (Connection Status or VAD Status) -->
			<div class="absolute top-4 right-4">
				{#if isRecording}
					<!-- VAD Status when recording -->
					<div class="badge gap-2 p-3" class:badge-info={!isSpeaking} class:badge-success={isSpeaking}>
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
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						{#if isSpeaking}
							<span>{$_('dictate.speakingDetected')}</span>
						{:else}
							<span>{$_('dictate.listeningForSpeech')}</span>
						{/if}
					</div>
				{:else if isWasmLoading || !isWasmReady}
					<!-- Connection status when not recording -->
					<div class="badge badge-info gap-2 p-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 animate-spin"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						<span>{initializationStatus}</span>
					</div>
				{:else if isWasmReady && isConnected}
					<div class="badge badge-success gap-2 p-3">
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
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{initializationStatus}</span>
					</div>
				{/if}
			</div>

			<h2 class="card-title mb-6">Eesti keele kõnetuvastus</h2>

			<!-- Audio Source Selector -->
			<div class="w-full max-w-md mb-6">
				<div class="form-control">
					<label class="label">
						<span class="label-text font-semibold">Audio Source</span>
					</label>
					<select
						class="select select-bordered w-full"
						bind:value={audioSourceType}
						onchange={() => switchAudioSource(audioSourceType, selectedDeviceId)}
						disabled={isAudioSourceSwitching || !isWasmReady}
					>
						<option value="microphone">🎤 Microphone</option>
						{#if systemAudioAvailable}
							<option value="system">🔊 System Audio</option>
						{/if}
					</select>
				</div>

				<!-- Device Selector (if multiple devices available) -->
				{#if availableAudioDevices.length > 1}
					<div class="form-control mt-2">
						<label class="label">
							<span class="label-text font-semibold">Device</span>
						</label>
						<select
							class="select select-bordered w-full"
							bind:value={selectedDeviceId}
							onchange={() => switchAudioSource(audioSourceType, selectedDeviceId)}
							disabled={isAudioSourceSwitching || !isWasmReady}
						>
							<option value={null}>Default</option>
							{#each availableAudioDevices as device}
								<option value={device.deviceId}>{device.label}</option>
							{/each}
						</select>
					</div>
				{/if}

				<!-- Switching indicator -->
				{#if isAudioSourceSwitching}
					<div class="alert alert-info mt-2">
						<span class="loading loading-spinner loading-sm"></span>
						<span>Switching audio source...</span>
					</div>
				{/if}

				<!-- Platform-specific setup guide -->
				{#if audioSourceType === 'system' && !systemAudioAvailable && audioSourceManager}
					{@const setupInstructions = audioSourceManager.getSetupInstructions()}
					<div class="alert alert-warning mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
						<div class="flex flex-col gap-2 w-full">
							<h3 class="font-bold">{setupInstructions.title}</h3>
							<ol class="list-decimal list-inside space-y-1 text-sm">
								{#each setupInstructions.steps as step}
									<li>{step}</li>
								{/each}
							</ol>
						</div>
					</div>
				{/if}
			</div>

			<div class="flex flex-col items-center justify-center gap-6">
				<!-- Recording Button -->
				{#if !isRecording}
					<div class="flex flex-col items-center gap-3">
						<button
							class="btn btn-circle btn-primary w-24 h-24 hover:scale-105 transition-transform shadow-lg"
							onclick={startRecording}
							disabled={!isWasmReady || !isConnected}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-12 w-12"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
								/>
							</svg>
						</button>
						<span class="text-base font-semibold">{$_('dictate.startRecording')}</span>
					</div>
				{:else}
					<div class="flex flex-col items-center gap-3">
						<button class="btn btn-circle btn-error w-24 h-24 animate-pulse shadow-lg" onclick={stopRecording}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-12 w-12"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
								/>
							</svg>
						</button>
						<span class="text-base font-semibold">{$_('dictate.stopRecording')}</span>
					</div>
				{/if}
			</div>

	</div>
</div>

<!-- Speech Editor and Subtitle Preview -->
<div class="grid grid-cols-1 lg:grid-cols-7 gap-6 mb-6">
	<!-- Speech Editor (70% width on desktop) -->
	<div class="lg:col-span-5">
		<SpeechEditor
			bind:this={speechEditor}
			config={{
				fontSize: 16,
				onWordApproved: handleWordApproved,
				onSubtitleEmit: handleSubtitleEmit
			}}
			class="h-[600px]"
		/>
	</div>

	<!-- Subtitle Preview (30% width on desktop) -->
	<div class="lg:col-span-2">
		<SubtitlePreview
			segments={subtitleSegments}
			currentSegmentIndex={subtitleSegments.length - 1}
			class="h-[600px]"
		/>
	</div>
</div>

	<!-- Past Recordings -->
	{#if pastRecordings.length > 0}
		<div class="mt-6 space-y-4">
			<h2 class="text-2xl font-bold">{$_('dictate.pastRecordings')}</h2>
			{#each pastRecordings as recording (recording.id)}
				<div class="card bg-base-200 shadow-xl">
					<div class="card-body">
						<div class="flex justify-between items-start mb-2">
							<div class="text-sm text-base-content/60">
								{formatTimestamp(recording.timestamp)}
							</div>
							<div class="flex gap-2">
								<!-- Copy Button -->
								<button
									class="btn btn-sm btn-ghost btn-circle"
									onclick={() => copyToClipboard(recording.text)}
									title="Copy to clipboard"
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
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								</button>
								<!-- Delete Button -->
								<button
									class="btn btn-sm btn-ghost btn-circle"
									onclick={() => deleteRecording(recording.id)}
									title="Delete recording"
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
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
								</button>
							</div>
						</div>
						<div
							class="bg-base-100 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap"
						>
							{recording.text}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
	</div>
</div>
