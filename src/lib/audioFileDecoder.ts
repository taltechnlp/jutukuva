/**
 * Decode an audio file (mp3, wav, m4a, ogg, flac, ...) into 16 kHz mono Float32 PCM.
 *
 * Uses the browser's native AudioContext.decodeAudioData (supported by Chromium/Electron
 * for every format the OS can play). The decoded buffer is then downmixed to mono and
 * resampled to 16 kHz with OfflineAudioContext.
 */
export async function decodeAudioFileTo16kMono(file: File | ArrayBuffer): Promise<Float32Array> {
	const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;

	const decodeCtx = new AudioContext();
	let decoded: AudioBuffer;
	try {
		decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
	} finally {
		await decodeCtx.close();
	}

	const targetSampleRate = 16000;
	const targetLength = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));

	const offline = new OfflineAudioContext(1, targetLength, targetSampleRate);
	const source = offline.createBufferSource();
	source.buffer = decoded;

	if (decoded.numberOfChannels > 1) {
		const merger = offline.createChannelMerger(1);
		const splitter = offline.createChannelSplitter(decoded.numberOfChannels);
		const gain = offline.createGain();
		gain.gain.value = 1 / decoded.numberOfChannels;

		source.connect(splitter);
		for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
			splitter.connect(gain, ch);
		}
		gain.connect(merger, 0, 0);
		merger.connect(offline.destination);
	} else {
		source.connect(offline.destination);
	}

	source.start(0);
	const rendered = await offline.startRendering();
	return rendered.getChannelData(0);
}
