/**
 * ASR utility-process worker.
 *
 * Runs sherpa-onnx in a dedicated OS process spawned via utilityProcess.fork
 * from the main process, so the blocking synchronous native decode calls
 * never touch the Electron main process's NSRunLoop (which is what causes
 * the macOS beachball on long file transcriptions).
 *
 * Wire protocol (both directions use { type, id, ... }):
 *   main → worker:  { type: 'init', id, config }
 *                   { type: 'start', id }
 *                   { type: 'audio', id, samples }   (samples: Float32Array)
 *                   { type: 'stop', id }
 *   worker → main:  { type: 'reply', id, result }
 */

import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

let recognizer = null;
let stream = null;
let sessionId = null;
let debugLogStream = null;

function logHypothesis(text, isFinal) {
	if (!debugLogStream || !text) {
		return;
	}
	const ts = new Date().toISOString();
	const marker = isFinal ? '[FINAL]' : '[PARTIAL]';
	debugLogStream.write(`${ts} ${marker} ${text}\n`);
}

function initRecognizer(config) {
	const { libPath, modelDir, debugLogPath, platform, pwd } = config;

	if (platform === 'darwin') {
		process.env.DYLD_LIBRARY_PATH = `${libPath}:${process.env.DYLD_LIBRARY_PATH || ''}`;
		if (pwd) {
			process.env.PWD = pwd;
		}
	} else if (platform === 'linux') {
		process.env.LD_LIBRARY_PATH = `${libPath}:${process.env.LD_LIBRARY_PATH || ''}`;
	} else if (platform === 'win32') {
		process.env.PATH = `${libPath};${process.env.PATH || ''}`;
	}

	const require = createRequire(import.meta.url);
	const nativeAddonPath = path.join(libPath, 'sherpa-onnx.node');
	const addon = require(nativeAddonPath);

	// Inject the pre-loaded addon into require.cache so sherpa-onnx-node's
	// streaming-asr.js picks it up instead of trying to locate it itself.
	const addonJsPath = require.resolve('sherpa-onnx-node/addon.js');
	const Module = require('module');
	const cachedModule = new Module(addonJsPath);
	cachedModule.filename = addonJsPath;
	cachedModule.paths = Module._nodeModulePaths(path.dirname(addonJsPath));
	cachedModule.loaded = true;
	cachedModule.exports = addon;
	require.cache[addonJsPath] = cachedModule;

	const streamingAsr = require('sherpa-onnx-node/streaming-asr.js');

	const recognizerConfig = {
		featConfig: { sampleRate: 16000, featureDim: 80 },
		modelConfig: {
			transducer: {
				encoder: path.join(modelDir, 'encoder.onnx'),
				decoder: path.join(modelDir, 'decoder.onnx'),
				joiner: path.join(modelDir, 'joiner.onnx')
			},
			tokens: path.join(modelDir, 'tokens.txt'),
			numThreads: 2,
			provider: 'cpu',
			debug: 0
		},
		enableEndpoint: true
	};

	recognizer = new streamingAsr.OnlineRecognizer(recognizerConfig);

	if (debugLogPath) {
		debugLogStream = fs.createWriteStream(debugLogPath, { flags: 'w' });
		debugLogStream.write(`ASR Debug Log - Started at ${new Date().toISOString()}\n`);
		debugLogStream.write('='.repeat(80) + '\n\n');
	}

	console.log('[ASR-Worker] Recognizer ready');
}

function startSession() {
	if (!recognizer) {
		return { success: false, error: 'Recognizer not initialized' };
	}
	stream = recognizer.createStream();
	sessionId = `asr-${Date.now()}`;
	console.log('[ASR-Worker] Started new session:', sessionId);
	return { success: true, sessionId };
}

function processAudio(samples) {
	if (!stream || !recognizer) {
		return { text: '', isFinal: false, error: 'No active session' };
	}

	stream.acceptWaveform({ sampleRate: 16000, samples });

	while (recognizer.isReady(stream)) {
		recognizer.decode(stream);
	}

	const result = recognizer.getResult(stream);
	const text = (result.text || '').trim();

	let isFinal = false;
	if (recognizer.isEndpoint(stream)) {
		isFinal = true;
		recognizer.reset(stream);
	}

	logHypothesis(text, isFinal);

	return { text, isFinal };
}

function stopSession() {
	if (!stream || !recognizer) {
		return { text: '', isFinal: true };
	}

	try {
		stream.inputFinished();
		while (recognizer.isReady(stream)) {
			recognizer.decode(stream);
		}
		const result = recognizer.getResult(stream);
		const text = (result.text || '').trim();
		stream = null;
		const endedId = sessionId;
		sessionId = null;
		console.log('[ASR-Worker] Session ended:', endedId);
		return { text, isFinal: true };
	} catch (error) {
		stream = null;
		sessionId = null;
		return { text: '', isFinal: true, error: error.message };
	}
}

let audioMsgCount = 0;
function handleMessage(data) {
	const { type, id } = data;
	try {
		let result;
		switch (type) {
			case 'init':
				initRecognizer(data.config);
				result = { success: true };
				break;
			case 'start':
				result = startSession();
				break;
			case 'audio': {
				audioMsgCount++;
				if (audioMsgCount === 1 || audioMsgCount % 100 === 0) {
					const samples = data.samples;
					const kind = samples?.constructor?.name || typeof samples;
					const len = samples?.length ?? 'n/a';
					console.log(`[ASR-Worker] audio msg #${audioMsgCount}: ${kind} len=${len}`);
				}
				result = processAudio(data.samples);
				break;
			}
			case 'stop':
				result = stopSession();
				break;
			default:
				result = { error: `Unknown message type: ${type}` };
		}
		process.parentPort.postMessage({ type: 'reply', id, result });
	} catch (error) {
		console.error('[ASR-Worker] Error handling', type, error);
		process.parentPort.postMessage({
			type: 'reply',
			id,
			result: { error: error.message }
		});
	}
}

process.parentPort.on('message', (event) => {
	// Electron's MessagePortMain emits MessageEvent objects with `.data`,
	// but guard against plain-message deliveries just in case.
	const data = event && typeof event === 'object' && 'data' in event ? event.data : event;
	if (!data || typeof data !== 'object') {
		console.warn('[ASR-Worker] Ignoring message with unexpected shape:', event);
		return;
	}
	handleMessage(data);
});

console.log('[ASR-Worker] Worker started, pid:', process.pid);
