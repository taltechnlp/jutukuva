/**
 * Streaming audio file decoder → 16 kHz mono Float32 PCM chunks.
 *
 * Streams via mediabunny so peak memory stays bounded regardless of file
 * length (critical for hour-long recordings). Falls back to a full-file
 * `AudioContext.decodeAudioData` decode for any file mediabunny can't open
 * (rare formats, corrupted containers).
 */

import { AudioBufferSink, ALL_FORMATS, BlobSource, Input } from 'mediabunny';

import { decodeAudioFileTo16kMono } from './audioFileDecoder';

const TARGET_SAMPLE_RATE = 16000;

export interface StreamOptions {
	/** Aborts decoding mid-stream. */
	signal?: AbortSignal;
	/**
	 * Called with the fraction of the input file consumed so far (0..1). For
	 * the streaming path this is driven by sample timestamps vs. track
	 * duration; for the fallback path it's 1.0 once decoding completes.
	 */
	onProgress?: (fraction: number) => void;
}

export type ChunkHandler = (samples: Float32Array) => Promise<void> | void;

/**
 * Stream an audio file into 16 kHz mono Float32 PCM chunks. `onChunk` is
 * invoked sequentially with slices of decoded audio (no guaranteed size) and
 * the promise returned here resolves once the whole file has been processed.
 */
export async function streamAudioFileTo16kMono(
	file: File,
	onChunk: ChunkHandler,
	options: StreamOptions = {}
): Promise<void> {
	let emitted = false;
	const guardedOnChunk: ChunkHandler = (samples) => {
		emitted = true;
		return onChunk(samples);
	};
	try {
		await streamWithMediabunny(file, guardedOnChunk, options);
		return;
	} catch (err) {
		if (emitted) {
			// We've already fed audio to the caller — rewinding via full
			// decode would duplicate. Propagate the failure instead.
			throw err;
		}
		console.warn('[audioFileStreamer] Streaming failed, falling back to full decode:', err);
	}

	await fallbackFullDecode(file, onChunk, options);
}

async function fallbackFullDecode(
	file: File,
	onChunk: ChunkHandler,
	options: StreamOptions
): Promise<void> {
	const pcm = await decodeAudioFileTo16kMono(file);
	const CHUNK = TARGET_SAMPLE_RATE; // ~1 second
	for (let offset = 0; offset < pcm.length; offset += CHUNK) {
		if (options.signal?.aborted) {
			return;
		}
		const end = Math.min(offset + CHUNK, pcm.length);
		// Copy into a fresh array so the caller can transfer/retain it without
		// pinning the entire pcm buffer.
		const chunk = new Float32Array(end - offset);
		chunk.set(pcm.subarray(offset, end));
		await onChunk(chunk);
		options.onProgress?.(Math.min(1, end / pcm.length));
	}
	options.onProgress?.(1);
}

// ────────────────────────────────────────────────────────────────────────────
// mediabunny streaming path
// ────────────────────────────────────────────────────────────────────────────

async function streamWithMediabunny(
	file: File,
	onChunk: ChunkHandler,
	options: StreamOptions
): Promise<void> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const audioTrack = await input.getPrimaryAudioTrack();
		if (!audioTrack) {
			throw new Error('No audio track in file');
		}

		const duration = await audioTrack.computeDuration();
		const sink = new AudioBufferSink(audioTrack);

		// Phase-stable linear-interp resampler state. Positions are absolute
		// input-sample coordinates so chunk boundaries don't reset phase.
		let resampleCarry = new Float32Array(0);
		let inputSamplesConsumed = 0;
		let nextOutputInputPos = 0;

		// Batch resampled output into ~1s chunks so we're not paying IPC overhead
		// per decoded frame (mediabunny yields one AudioBuffer per packet).
		const outBuffer: Float32Array[] = [];
		let outBufferSamples = 0;
		const OUT_FLUSH_THRESHOLD = TARGET_SAMPLE_RATE;

		async function flushOut(force = false) {
			if (outBufferSamples === 0) return;
			if (!force && outBufferSamples < OUT_FLUSH_THRESHOLD) return;
			const merged = new Float32Array(outBufferSamples);
			let o = 0;
			for (const buf of outBuffer) {
				merged.set(buf, o);
				o += buf.length;
			}
			outBuffer.length = 0;
			outBufferSamples = 0;
			await onChunk(merged);
		}

		for await (const { buffer, timestamp } of sink.buffers()) {
			if (options.signal?.aborted) {
				return;
			}

			const inRate = buffer.sampleRate;
			const channels = buffer.numberOfChannels;
			const frames = buffer.length;

			// Downmix to mono in one pass, summing all channels.
			const mono = new Float32Array(frames);
			if (channels === 1) {
				mono.set(buffer.getChannelData(0));
			} else {
				const invC = 1 / channels;
				for (let ch = 0; ch < channels; ch++) {
					const data = buffer.getChannelData(ch);
					for (let i = 0; i < frames; i++) {
						mono[i] += data[i] * invC;
					}
				}
			}

			// Resample to 16 kHz with a carry across chunks for phase stability.
			const combined = new Float32Array(resampleCarry.length + mono.length);
			combined.set(resampleCarry);
			combined.set(mono, resampleCarry.length);
			const combinedInputEnd = inputSamplesConsumed + combined.length;

			let resampled: Float32Array;
			if (inRate === TARGET_SAMPLE_RATE) {
				resampled = combined;
				resampleCarry = new Float32Array(0);
				inputSamplesConsumed += combined.length;
				nextOutputInputPos = inputSamplesConsumed;
			} else {
				const step = inRate / TARGET_SAMPLE_RATE;
				const out: number[] = [];
				while (nextOutputInputPos + 1 < combinedInputEnd) {
					const rel = nextOutputInputPos - inputSamplesConsumed;
					const idx = Math.floor(rel);
					const frac = rel - idx;
					out.push(combined[idx] * (1 - frac) + combined[idx + 1] * frac);
					nextOutputInputPos += step;
				}
				resampled = new Float32Array(out);

				const keepFromRel = Math.max(
					0,
					Math.min(combined.length, Math.floor(nextOutputInputPos) - inputSamplesConsumed)
				);
				resampleCarry = combined.slice(keepFromRel);
				inputSamplesConsumed += keepFromRel;
			}

			if (resampled.length > 0) {
				outBuffer.push(resampled);
				outBufferSamples += resampled.length;
			}

			await flushOut();
			if (duration > 0) {
				options.onProgress?.(Math.min(0.99, timestamp / duration));
			}
		}

		// Drain the resample carry. The final few samples won't be resampled
		// (linear interp needs a following sample), which is fine — <1 ms lost.
		await flushOut(true);
		options.onProgress?.(1);
	} finally {
		input.dispose();
	}
}
