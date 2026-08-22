import {
	getModelPath,
	MODEL_INFO,
	getLibraryPath,
	setupLibraryPath
} from './sherpa-config.js';
import { downloadModel, isModelDownloaded } from './model-downloader.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, utilityProcess } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let worker = null;
let isInitialized = false;
let modelDir = null;
let sessionId = null;

let nextRequestId = 1;
const pending = new Map();

function sendToWorker(type, extra = {}) {
	if (!worker) {
		return Promise.resolve({ error: 'ASR worker not running' });
	}
	const id = nextRequestId++;
	return new Promise((resolve) => {
		pending.set(id, resolve);
		worker.postMessage({ type, id, ...extra });
	});
}

function attachWorkerHandlers() {
	worker.on('message', (message) => {
		if (message && message.type === 'reply') {
			const resolver = pending.get(message.id);
			if (resolver) {
				pending.delete(message.id);
				resolver(message.result);
			}
		}
	});

	worker.on('exit', (code) => {
		console.error('[ASR] Worker exited with code:', code);
		worker = null;
		isInitialized = false;
		sessionId = null;
		for (const resolver of pending.values()) {
			resolver({ error: 'ASR worker exited' });
		}
		pending.clear();
	});
}

/**
 * Initialize the ASR system
 * - Downloads model if needed (in main process — needs Electron app API)
 * - Spawns utility process for sherpa-onnx
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
		console.log('[ASR] Checking for model...');
		const modelExists = await isModelDownloaded();

		if (!modelExists) {
			console.log('[ASR] Model not found, downloading...');
			modelDir = await downloadModel(onProgress);
		} else {
			modelDir = getModelPath(MODEL_INFO.name);
			console.log('[ASR] Using existing model at:', modelDir);
		}

		// Verify the native library path exists and log it. The worker will
		// set DYLD_LIBRARY_PATH for its own process; this call is just to
		// fail fast with a clear error if the libs are missing.
		setupLibraryPath();

		console.log('[ASR] Spawning utility process worker...');
		const workerPath = path.join(__dirname, 'asr-worker.js');
		worker = utilityProcess.fork(workerPath, [], {
			serviceName: 'jutukuva-asr',
			stdio: 'inherit'
		});

		await new Promise((resolve, reject) => {
			worker.once('spawn', resolve);
			worker.once('exit', (code) =>
				reject(new Error(`ASR worker exited during startup (code ${code})`))
			);
		});

		attachWorkerHandlers();

		const debugLogPath = path.join(app.getPath('userData'), 'asr-debug.log');
		const result = await sendToWorker('init', {
			config: {
				libPath: getLibraryPath(),
				modelDir,
				debugLogPath,
				platform: process.platform,
				pwd: process.cwd()
			}
		});

		if (result.error) {
			console.error('[ASR] Worker init failed:', result.error);
			worker?.kill();
			worker = null;
			return { success: false, error: `Failed to initialize ASR worker: ${result.error}` };
		}

		isInitialized = true;
		console.log('[ASR] Debug log file:', debugLogPath);
		return { success: true };
	} catch (error) {
		console.error('[ASR] Initialization failed:', error);
		return { success: false, error: error.message };
	}
}

/**
 * Start a new ASR session
 * @returns {Promise<{success: boolean, sessionId?: string, error?: string}>}
 */
export async function startSession() {
	if (!isInitialized) {
		return { success: false, error: 'ASR not initialized. Call initializeASR() first.' };
	}

	const result = await sendToWorker('start');
	if (result?.success) {
		sessionId = result.sessionId;
	}
	return result;
}

/**
 * Process audio samples
 * @param {Float32Array} samples - Audio samples at 16kHz
 * @returns {Promise<{text: string, isFinal: boolean, error?: string}>}
 */
export async function processAudio(samples) {
	if (!isInitialized) {
		return { text: '', isFinal: false, error: 'ASR not initialized' };
	}
	return sendToWorker('audio', { samples });
}

/**
 * Stop the current ASR session
 * @returns {Promise<{text: string, isFinal: boolean, error?: string}>}
 */
export async function stopSession() {
	if (!isInitialized) {
		return { text: '', isFinal: true };
	}
	const result = await sendToWorker('stop');
	sessionId = null;
	return result;
}

/**
 * Get ASR status
 */
export function getStatus() {
	return {
		isInitialized,
		hasActiveSession: sessionId !== null,
		sessionId,
		modelPath: modelDir
	};
}

/**
 * Cleanup ASR resources
 */
export function cleanup() {
	console.log('[ASR] Cleaning up...');
	if (worker) {
		try {
			worker.kill();
		} catch (e) {
			console.warn('[ASR] Error killing worker:', e.message);
		}
		worker = null;
	}
	isInitialized = false;
	modelDir = null;
	sessionId = null;
	for (const resolver of pending.values()) {
		resolver({ error: 'ASR shutdown' });
	}
	pending.clear();
	console.log('[ASR] Cleanup complete');
}
