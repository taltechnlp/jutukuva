/**
 * AudioSourceManager
 *
 * Manages audio input sources for the ASR application.
 * Supports switching between microphone and system audio (loopback)
 * across different platforms (Linux, Windows, macOS).
 */

export type AudioSourceType = 'microphone' | 'system';

export interface AudioDevice {
	deviceId: string;
	label: string;
	kind: 'audioinput' | 'audiooutput';
}

export class AudioSourceManager {
	private platform: string = 'web';

	constructor() {
		// Platform will be set async in initialize()
	}

	/**
	 * Initialize the audio source manager (must be called after construction)
	 */
	async initialize() {
		// Detect platform
		if (typeof window !== 'undefined' && window.electronAPI) {
			this.platform = await window.electronAPI.getPlatform();
		} else {
			this.platform = 'web';
		}
		console.log('[AudioSourceManager] Platform:', this.platform);
	}

	/**
	 * Get the current platform
	 */
	getPlatform(): string {
		return this.platform;
	}

	/**
	 * Check if system audio capture is supported/available on this platform
	 */
	async checkSystemAudioSupport(): Promise<boolean> {
		try {
			const devices = await this.enumerateAudioDevices();
			const loopbackDevices = this.findLoopbackDevices(devices);

			// If loopback devices found, system audio is available
			if (loopbackDevices.length > 0) {
				return true;
			}

			// On Windows and Linux, desktopCapturer can work as fallback
			if (this.platform === 'win32' || this.platform === 'linux') {
				return true;
			}

			// On macOS, require virtual audio device
			if (this.platform === 'darwin') {
				return loopbackDevices.length > 0;
			}

			return false;
		} catch (error) {
			console.error('[AudioSourceManager] Error checking system audio support:', error);
			return false;
		}
	}

	/**
	 * Enumerate all audio input devices
	 */
	async enumerateAudioDevices(): Promise<AudioDevice[]> {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === 'audioinput')
			.map((d) => ({
				deviceId: d.deviceId,
				label: d.label || `Device ${d.deviceId.slice(0, 8)}`,
				kind: d.kind as 'audioinput'
			}));
	}

	/**
	 * Find loopback/monitor audio devices
	 */
	findLoopbackDevices(devices: AudioDevice[]): AudioDevice[] {
		const loopbackPatterns = [
			/Monitor/i, // Linux PulseAudio/PipeWire
			/Stereo Mix/i, // Windows
			/Wave Out/i, // Windows alternative
			/CABLE Output/i, // VB-Cable (Windows)
			/BlackHole/i, // BlackHole (macOS)
			/Loopback/i, // Loopback app (macOS)
			/Aggregate/i // macOS Aggregate device
		];

		return devices.filter((device) =>
			loopbackPatterns.some((pattern) => pattern.test(device.label))
		);
	}

	/**
	 * Get microphone stream
	 */
	async getMicrophoneStream(deviceId: string | null = null): Promise<MediaStream> {
		const constraints: MediaStreamConstraints = {
			audio: deviceId
				? {
						deviceId: { exact: deviceId },
						sampleRate: { ideal: 16000 },
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true
					}
				: {
						sampleRate: { ideal: 16000 },
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true
					}
		};

		return await navigator.mediaDevices.getUserMedia(constraints);
	}

	/**
	 * Get system audio stream
	 */
	async getSystemAudioStream(deviceId: string | null = null): Promise<MediaStream> {
		// Try to get stream based on platform
		switch (this.platform) {
			case 'linux':
				return await this.getLinuxSystemAudio(deviceId);
			case 'win32':
				return await this.getWindowsSystemAudio(deviceId);
			case 'darwin':
				return await this.getMacOSSystemAudio(deviceId);
			default:
				throw new Error('System audio capture not supported on this platform');
		}
	}

	/**
	 * Get Linux system audio (PulseAudio/PipeWire monitor)
	 */
	private async getLinuxSystemAudio(deviceId: string | null): Promise<MediaStream> {
		// If specific device provided, use it
		if (deviceId) {
			return await this.getLoopbackStream(deviceId);
		}

		// Find monitor device
		const devices = await this.enumerateAudioDevices();
		const monitor = devices.find((d) => /Monitor/i.test(d.label));

		if (!monitor) {
			throw new Error(
				'No monitor device found. Please check that PulseAudio/PipeWire is running and monitor sources are available.'
			);
		}

		return await this.getLoopbackStream(monitor.deviceId);
	}

	/**
	 * Get Windows system audio (Stereo Mix or desktopCapturer)
	 */
	private async getWindowsSystemAudio(deviceId: string | null): Promise<MediaStream> {
		// If specific device provided, use it
		if (deviceId) {
			return await this.getLoopbackStream(deviceId);
		}

		// Try to find Stereo Mix or Wave Out
		const devices = await this.enumerateAudioDevices();
		const stereoMix = devices.find((d) => /Stereo Mix|Wave Out/i.test(d.label));

		if (stereoMix) {
			return await this.getLoopbackStream(stereoMix.deviceId);
		}

		// Fall back to desktopCapturer
		console.log('[AudioSourceManager] Stereo Mix not found, using desktopCapturer');
		return await this.getDesktopCapturerAudio();
	}

	/**
	 * Get macOS system audio (requires BlackHole or similar)
	 */
	private async getMacOSSystemAudio(deviceId: string | null): Promise<MediaStream> {
		// If specific device provided, use it
		if (deviceId) {
			return await this.getLoopbackStream(deviceId);
		}

		// Check for virtual audio devices
		const devices = await this.enumerateAudioDevices();
		const virtualDevice = devices.find((d) => /BlackHole|Loopback|Aggregate/i.test(d.label));

		if (!virtualDevice) {
			throw new Error(
				'No virtual audio device found on macOS. Please install BlackHole: https://existential.audio/blackhole/'
			);
		}

		return await this.getLoopbackStream(virtualDevice.deviceId);
	}

	/**
	 * Get audio stream from specific loopback device
	 */
	private async getLoopbackStream(deviceId: string): Promise<MediaStream> {
		const constraints: MediaStreamConstraints = {
			audio: {
				deviceId: { exact: deviceId },
				sampleRate: { ideal: 16000 },
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false
			}
		};

		return await navigator.mediaDevices.getUserMedia(constraints);
	}

	/**
	 * Get audio using Electron's desktopCapturer API
	 */
	private async getDesktopCapturerAudio(): Promise<MediaStream> {
		if (!window.electronAPI) {
			throw new Error('desktopCapturer not available (not running in Electron)');
		}

		// Get available desktop sources
		const sources = await window.electronAPI.getDesktopSources();

		if (sources.length === 0) {
			throw new Error('No desktop sources available for capture');
		}

		// Use first source (user should select in production)
		const sourceId = sources[0].id;

		console.log('[AudioSourceManager] Using desktop source:', sources[0].name);

		// Request screen capture with audio
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				mandatory: {
					chromeMediaSource: 'desktop',
					chromeMediaSourceId: sourceId
				}
			} as any,
			video: {
				mandatory: {
					chromeMediaSource: 'desktop',
					chromeMediaSourceId: sourceId,
					maxWidth: 1,
					maxHeight: 1
				}
			} as any
		});

		// Extract only audio tracks
		const audioTracks = stream.getAudioTracks();
		if (audioTracks.length === 0) {
			throw new Error('No audio tracks in desktop capture stream');
		}

		// Stop video tracks (we don't need them)
		stream.getVideoTracks().forEach((track) => track.stop());

		return new MediaStream(audioTracks);
	}

	/**
	 * Get setup instructions for the current platform
	 */
	getSetupInstructions(): { title: string; steps: string[] } {
		switch (this.platform) {
			case 'linux':
				return {
					title: 'Linux System Audio Setup',
					steps: [
						'Monitor sources are automatically available in PulseAudio/PipeWire.',
						'Select a Monitor device from the dropdown and start recording.',
						'',
						'IMPORTANT LIMITATION:',
						'Audio capture will STOP when system speakers are muted.',
						'This is expected Chrome/PipeWire behavior - Chrome pauses audio',
						'playback when it detects muted output (performance optimization).',
						'',
						'WORKAROUNDS FOR SILENT CAPTURE:',
						'- Keep speakers unmuted but set volume very low (1-2%)',
						'- Use headphones and remove them from your ears',
						'- Route audio to a disconnected output device',
						'',
						'TROUBLESHOOTING:',
						'- No monitor devices? Run: pactl list sources short | grep monitor',
						'- Check PulseAudio/PipeWire is running: pulseaudio --check',
						'- Verify browser has permission to access audio devices'
					]
				};

			case 'win32':
				return {
					title: 'Windows System Audio Setup',
					steps: [
						'Right-click the sound icon in system tray',
						'Select "Sounds" → "Recording" tab',
						'Right-click in empty space → "Show Disabled Devices"',
						'Enable "Stereo Mix" or "Wave Out Mix"',
						'Restart the application'
					]
				};

			case 'darwin':
				return {
					title: 'macOS System Audio Setup',
					steps: [
						'Install BlackHole: https://existential.audio/blackhole/',
						'Open Audio MIDI Setup (Applications → Utilities)',
						'Create a Multi-Output Device combining your speakers and BlackHole',
						'Set Multi-Output Device as default output',
						'Select BlackHole as input in this app'
					]
				};

			default:
				return {
					title: 'System Audio Not Supported',
					steps: ['System audio capture is only available in the desktop app']
				};
		}
	}
}
