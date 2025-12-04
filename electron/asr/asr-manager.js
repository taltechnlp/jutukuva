import { setupLibraryPath, getRecognizerConfig, getModelPath, MODEL_INFO } from './sherpa-config.js';
import { downloadModel, isModelDownloaded } from './model-downloader.js';

// Sherpa-onnx module (loaded dynamically after library path setup)
let sherpa = null;

// Recognizer state
let recognizer = null;
let stream = null;
let isInitialized = false;
let modelDir = null;
let sessionId = null;

/**
 * Initialize the ASR system
 * - Downloads model if needed
 * - Sets up library paths
 * - Creates the recognizer
 *
 * @param {Function} onProgress - Progress callback for model download
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function initializeASR(onProgress) {
  if (isInitialized) {
    console.log('[ASR] Already initialized');
    return { success: true, alreadyInitialized: true };
  }

  try {
    // Step 1: Check/download model
    console.log('[ASR] Checking for model...');
    const modelExists = await isModelDownloaded();

    if (!modelExists) {
      console.log('[ASR] Model not found, downloading...');
      modelDir = await downloadModel(onProgress);
    } else {
      modelDir = getModelPath(MODEL_INFO.name);
      console.log('[ASR] Using existing model at:', modelDir);
    }

    // Step 2: Setup library paths (MUST be done before require)
    console.log('[ASR] Setting up library paths...');
    setupLibraryPath();

    // Step 3: Load sherpa-onnx-node module
    console.log('[ASR] Loading sherpa-onnx-node...');
    try {
      // Dynamic import since we need library path set first
      sherpa = await import('sherpa-onnx-node');
      console.log('[ASR] sherpa-onnx-node loaded successfully');
    } catch (loadError) {
      console.error('[ASR] Failed to load sherpa-onnx-node:', loadError);
      return {
        success: false,
        error: `Failed to load ASR module: ${loadError.message}`
      };
    }

    // Step 4: Create recognizer
    console.log('[ASR] Creating recognizer...');
    const config = getRecognizerConfig(modelDir);
    console.log('[ASR] Recognizer config:', JSON.stringify(config, null, 2));

    try {
      recognizer = new sherpa.OnlineRecognizer(config);
      console.log('[ASR] Recognizer created successfully');
    } catch (recError) {
      console.error('[ASR] Failed to create recognizer:', recError);
      return {
        success: false,
        error: `Failed to create recognizer: ${recError.message}`
      };
    }

    isInitialized = true;
    return { success: true };
  } catch (error) {
    console.error('[ASR] Initialization failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Start a new ASR session
 * @returns {{success: boolean, sessionId?: string, error?: string}}
 */
export function startSession() {
  if (!isInitialized || !recognizer) {
    return {
      success: false,
      error: 'ASR not initialized. Call initializeASR() first.'
    };
  }

  // End any existing session
  if (stream) {
    console.log('[ASR] Ending previous session');
    stream = null;
  }

  try {
    // Create new stream for this session
    stream = recognizer.createStream();
    sessionId = `asr-${Date.now()}`;

    console.log('[ASR] Started new session:', sessionId);
    return {
      success: true,
      sessionId
    };
  } catch (error) {
    console.error('[ASR] Failed to start session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process audio samples
 * @param {Float32Array} samples - Audio samples at 16kHz
 * @returns {{text: string, isFinal: boolean, error?: string}}
 */
export function processAudio(samples) {
  if (!stream || !recognizer) {
    return {
      text: '',
      isFinal: false,
      error: 'No active session'
    };
  }

  try {
    // Feed audio to recognizer
    stream.acceptWaveform({
      sampleRate: 16000,
      samples: samples
    });

    // Decode available frames
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }

    // Get current result
    const result = recognizer.getResult(stream);
    const text = result.text || '';

    // Check for endpoint (utterance boundary)
    let isFinal = false;
    if (recognizer.isEndpoint(stream)) {
      isFinal = true;
      recognizer.reset(stream);
    }

    return {
      text: text.trim(),
      isFinal
    };
  } catch (error) {
    console.error('[ASR] Audio processing error:', error);
    return {
      text: '',
      isFinal: false,
      error: error.message
    };
  }
}

/**
 * Stop the current ASR session
 * @returns {{text: string, isFinal: boolean, error?: string}}
 */
export function stopSession() {
  if (!stream || !recognizer) {
    return {
      text: '',
      isFinal: true
    };
  }

  try {
    // Flush any remaining audio
    stream.inputFinished();

    // Decode remaining frames
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }

    // Get final result
    const result = recognizer.getResult(stream);
    const text = result.text || '';

    // Clean up stream
    stream = null;
    const endedSessionId = sessionId;
    sessionId = null;

    console.log('[ASR] Session ended:', endedSessionId);

    return {
      text: text.trim(),
      isFinal: true
    };
  } catch (error) {
    console.error('[ASR] Error stopping session:', error);
    stream = null;
    sessionId = null;
    return {
      text: '',
      isFinal: true,
      error: error.message
    };
  }
}

/**
 * Get ASR status
 * @returns {{isInitialized: boolean, hasActiveSession: boolean, sessionId: string|null, modelPath: string|null}}
 */
export function getStatus() {
  return {
    isInitialized,
    hasActiveSession: stream !== null,
    sessionId,
    modelPath: modelDir
  };
}

/**
 * Cleanup ASR resources
 */
export function cleanup() {
  console.log('[ASR] Cleaning up...');

  if (stream) {
    stream = null;
  }

  if (recognizer) {
    recognizer = null;
  }

  isInitialized = false;
  modelDir = null;
  sessionId = null;
  sherpa = null;

  console.log('[ASR] Cleanup complete');
}
