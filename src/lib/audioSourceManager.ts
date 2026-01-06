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
	kind: 'audioinput' | 'audiooutput' | 'desktop';
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

			// On Linux, we MUST have loopback devices - desktopCapturer audio-only crashes in Electron 33+
			if (this.platform === 'linux') {
				console.log('[AudioSourceManager] No loopback devices found on Linux, system audio not available');
				return false;
			}

			// On Windows/macOS, desktopCapturer can work as fallback
			if (this.platform === 'win32' || this.platform === 'darwin') {
				return true;
			}

			return false;
		} catch (error) {
			console.error('[AudioSourceManager] Error checking system audio support:', error);
			return false;
		}
	}

	/**
	 * Check if a virtual audio device is available (for macOS)
	 */
	async hasVirtualAudioDevice(): Promise<boolean> {
		try {
			const devices = await this.enumerateAudioDevices();
			const virtualDevices = this.findLoopbackDevices(devices);
			return virtualDevices.length > 0;
		} catch (error) {
			console.error('[AudioSourceManager] Error checking for virtual audio device:', error);
			return false;
		}
	}

	/**
	 * Enumerate all audio input devices
	 * @param sourceType Optional filter: 'microphone' returns only mics, 'system' returns only monitors
	 * @param skipDesktopSources If true, skip enumerating desktop sources (to avoid permission prompts during initialization)
	 */
	async enumerateAudioDevices(sourceType?: AudioSourceType, skipDesktopSources: boolean = false): Promise<AudioDevice[]> {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const allAudioInputs = devices
			.filter((d) => d.kind === 'audioinput')
			.filter((d) => d.deviceId !== 'default' && d.deviceId !== '') // Filter out default device duplicates
			.map((d) => ({
				deviceId: d.deviceId,
				label: d.label || `Device ${d.deviceId.slice(0, 8)}`,
				kind: d.kind as 'audioinput'
			}));

		// Removed verbose logging to avoid triggering permission dialogs

		// If no source type specified, return all devices
		if (!sourceType) {
			return allAudioInputs;
		}

		// Filter based on source type
		if (sourceType === 'system') {
			// On Windows/macOS, prefer desktop sources over monitor/loopback devices
			// Desktop sources allow selecting specific windows/screens and work consistently
			// Skip during initialization to avoid triggering screen sharing permission prompts
			// NOTE: On Linux, desktopCapturer audio-only capture is not supported in Electron 33+
			// and will crash the renderer, so we only use PulseAudio/PipeWire monitor devices
			if (window.electronAPI && !skipDesktopSources && this.platform !== 'linux') {
				const desktopSources = await this.getDesktopSourcesAsDevices();
				if (desktopSources.length > 0) {
					console.log('[AudioSourceManager] Found', desktopSources.length, 'desktop sources');
					return desktopSources;
				}
			}

			// Use loopback/monitor devices (required on Linux, fallback on other platforms)
			const loopbackDevices = this.findLoopbackDevices(allAudioInputs);
			if (loopbackDevices.length > 0) {
				console.log('[AudioSourceManager] Found', loopbackDevices.length, 'loopback devices');
			}
			return loopbackDevices;
		} else {
			// Return only non-loopback devices (microphones)
			const loopbackDevices = this.findLoopbackDevices(allAudioInputs);
			const loopbackIds = new Set(loopbackDevices.map((d) => d.deviceId));
			return allAudioInputs.filter((d) => !loopbackIds.has(d.deviceId));
		}
	}

	/**
	 * Find loopback/monitor audio devices
	 */
	findLoopbackDevices(devices: AudioDevice[]): AudioDevice[] {
		const loopbackPatterns = [
			/Monitor of/i, // PulseAudio/PipeWire explicit format
			/Monitor/i, // Generic monitor
			/\.monitor$/i, // PulseAudio suffix format
			/Stereo Mix/i, // Windows
			/Wave Out/i, // Windows alternative
			/CABLE Output/i, // VB-Cable (Windows)
			/BlackHole/i, // BlackHole (macOS)
			/Loopback/i, // Loopback app (macOS)
			/Aggregate/i // macOS Aggregate device
		];

		const monitors = devices.filter((device) => {
			const matches = loopbackPatterns.some((pattern) => pattern.test(device.label));
			if (matches) {
				console.log('[AudioSourceManager] Detected monitor device:', device.label);
			}
			return matches;
		});

		return monitors;
	}

	/**
	 * Get desktop sources as audio devices (for Linux desktopCapturer)
	 */
	private async getDesktopSourcesAsDevices(): Promise<AudioDevice[]> {
		if (!window.electronAPI) {
			return [];
		}

		try {
			const sources = await window.electronAPI.getDesktopSources();
			return sources.map((source: any) => ({
				deviceId: source.id,
				label: source.name,
				kind: 'desktop' as const
			}));
		} catch (error) {
			console.error('[AudioSourceManager] Error getting desktop sources:', error);
			return [];
		}
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
	 * Note: desktopCapturer audio-only capture is not supported on Linux in Electron 33+
	 * and will crash the renderer. Use only PulseAudio/PipeWire monitor devices.
	 */
	private async getLinuxSystemAudio(deviceId: string | null): Promise<MediaStream> {
		// If specific device provided, use it (must be a monitor device, not desktop source)
		if (deviceId) {
			// Desktop source IDs start with 'screen:' or 'window:' - these don't work for audio-only on Linux
			if (deviceId.startsWith('screen:') || deviceId.startsWith('window:')) {
				console.warn('[AudioSourceManager] Desktop sources not supported for audio-only on Linux, finding monitor device...');
				// Fall through to find a monitor device
			} else {
				try {
					return await this.getLoopbackStream(deviceId);
				} catch (error) {
					console.warn('[AudioSourceManager] Monitor device not found:', error);
					// Fall through to find another monitor device
				}
			}
		}

		// Find monitor device from PulseAudio/PipeWire
		const devices = await this.enumerateAudioDevices();
		const monitor = devices.find((d) => /Monitor/i.test(d.label));

		if (monitor) {
			try {
				return await this.getLoopbackStream(monitor.deviceId);
			} catch (error) {
				throw new Error(`Failed to access monitor device "${monitor.label}": ${error}`);
			}
		}

		// No monitor device found
		throw new Error('NO_MONITOR_DEVICE');
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
		return await this.getDesktopCapturerAudio(null);
	}

	/**
	 * Get macOS system audio (uses desktopCapturer or virtual audio device)
	 */
	private async getMacOSSystemAudio(deviceId: string | null): Promise<MediaStream> {
		// If specific device provided, check if it's a desktop source or virtual device
		if (deviceId) {
			// Desktop source IDs start with 'screen:' or 'window:'
			if (deviceId.startsWith('screen:') || deviceId.startsWith('window:')) {
				return await this.getDesktopCapturerAudio(deviceId);
			} else {
				return await this.getLoopbackStream(deviceId);
			}
		}

		// Check for virtual audio devices
		const devices = await this.enumerateAudioDevices();
		const virtualDevice = devices.find((d) => /BlackHole|Loopback|Aggregate/i.test(d.label));

		if (virtualDevice) {
			return await this.getLoopbackStream(virtualDevice.deviceId);
		}

		// Fall back to desktopCapturer if no virtual device found
		console.log('[AudioSourceManager] No virtual audio device found, using desktopCapturer');
		return await this.getDesktopCapturerAudio(null);
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
	 * @param sourceId Optional specific source ID to use
	 */
	private async getDesktopCapturerAudio(sourceId: string | null = null): Promise<MediaStream> {
		if (!window.electronAPI) {
			throw new Error('desktopCapturer not available (not running in Electron)');
		}

		// Get available desktop sources
		const sources = await window.electronAPI.getDesktopSources();

		if (sources.length === 0) {
			throw new Error('No desktop sources available for capture');
		}

		// Use provided sourceId or first source
		let selectedSourceId = sourceId;
		let sourceName = 'Unknown';

		if (sourceId) {
			const source = sources.find((s: any) => s.id === sourceId);
			if (source) {
				sourceName = source.name;
			} else {
				console.warn('[AudioSourceManager] Requested source not found, using first available');
				selectedSourceId = sources[0].id;
				sourceName = sources[0].name;
			}
		} else {
			selectedSourceId = sources[0].id;
			sourceName = sources[0].name;
		}

		console.log('[AudioSourceManager] Using desktop source:', sourceName, 'ID:', selectedSourceId);

		// Request screen capture with audio only (no video to avoid screen recording permission)
		console.log('[AudioSourceManager] Requesting desktop capture...');
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				mandatory: {
					chromeMediaSource: 'desktop',
					chromeMediaSourceId: selectedSourceId
				}
			} as any
		});

		console.log('[AudioSourceManager] Got stream, checking tracks...');
		console.log('[AudioSourceManager] Audio tracks:', stream.getAudioTracks().length);

		// Extract audio tracks
		const audioTracks = stream.getAudioTracks();
		if (audioTracks.length === 0) {
			console.error('[AudioSourceManager] No audio tracks found in desktop capture!');
			console.error('[AudioSourceManager] This may mean:');
			console.error('[AudioSourceManager]   1. The selected source has no audio');
			console.error('[AudioSourceManager]   2. macOS is blocking audio capture');
			console.error('[AudioSourceManager]   3. The source needs to be playing audio');
			throw new Error('No audio tracks in desktop capture stream. The selected source may not have audio, or you may need to play audio from that source first.');
		}

		console.log('[AudioSourceManager] Audio track details:', audioTracks[0].getSettings());

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
						'Option 1 (Recommended): Select a specific window or screen from the dropdown',
						'This will capture audio from that source directly.',
						'',
						'Option 2 (Advanced): Use a virtual audio device for system-wide capture',
						'- Install BlackHole from GitHub: https://github.com/ExistentialAudio/BlackHole/releases',
						'  (Download BlackHole2ch.pkg from the Assets section)',
						'- Open Audio MIDI Setup (Applications → Utilities)',
						'- Create a Multi-Output Device combining your speakers and BlackHole',
						'- Set Multi-Output Device as default output',
						'- Select BlackHole as input in this app'
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
