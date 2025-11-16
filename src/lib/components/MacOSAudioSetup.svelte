<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		onClose: () => void;
		hasVirtualDevice?: boolean;
	}

	let { onClose, hasVirtualDevice = false }: Props = $props();

	let currentStep = $state(hasVirtualDevice ? 2 : 0); // Skip to step 2 if already has device
	let isDownloading = $state(false);
	let downloadProgress = $state(0);
	let downloadError = $state<string | null>(null);

	const steps = [
		{
			title: 'Install BlackHole Audio Driver',
			description: 'BlackHole is a free, open-source virtual audio driver for macOS',
			action: 'Download & Install',
			details: [
				'Click the button below to download BlackHole 2ch',
				'The installer will open automatically when download completes',
				'Follow the installation wizard (requires admin password)',
				'You may need to reboot your Mac after installation',
				'Restart this app after installation to detect BlackHole'
			]
		},
		{
			title: 'Create Multi-Output Device',
			description: 'This allows you to hear audio while capturing it',
			action: 'Open Audio MIDI Setup',
			details: [
				'Click the button to open Audio MIDI Setup',
				'Click the "+" button at bottom-left',
				'Select "Create Multi-Output Device"',
				'Check both "Built-in Output" and "BlackHole 2ch"',
				'Right-click the Multi-Output Device and select "Use This Device For Sound Output"'
			]
		},
		{
			title: 'Select BlackHole in App',
			description: 'Configure the app to capture from BlackHole',
			action: 'Continue',
			details: [
				'In the main app window, switch to "Microphone" mode',
				'Select "BlackHole 2ch" from the device dropdown',
				'Start recording - you should now capture system audio!'
			]
		}
	];

	async function downloadBlackHole() {
		if (!window.electronAPI?.downloadBlackHole) {
			// Fallback: Open GitHub releases page in browser
			const githubReleasesUrl = 'https://github.com/ExistentialAudio/BlackHole/releases';
			window.open(githubReleasesUrl, '_blank');
			return;
		}

		try {
			isDownloading = true;
			downloadProgress = 0;
			downloadError = null;

			// Listen for progress updates
			if (window.electronAPI.onDownloadProgress) {
				window.electronAPI.onDownloadProgress((progress: number) => {
					downloadProgress = progress;
				});
			}

			// Start download
			const result = await window.electronAPI.downloadBlackHole();

			if (result.success) {
				console.log('[MacOSSetup] Download complete:', result.path);
				downloadProgress = 100;
				// Give user time to see 100% before moving forward
				setTimeout(() => {
					isDownloading = false;
				}, 1000);
			} else {
				throw new Error(result.error || 'Download failed');
			}
		} catch (error) {
			console.error('[MacOSSetup] Download error:', error);
			downloadError = error instanceof Error ? error.message : 'Download failed';
			isDownloading = false;

			// Fallback: Open releases page
			setTimeout(() => {
				const githubReleasesUrl = 'https://github.com/ExistentialAudio/BlackHole/releases';
				window.open(githubReleasesUrl, '_blank');
			}, 2000);
		}
	}

	async function openAudioMIDISetup() {
		// macOS command to open Audio MIDI Setup
		if (window.electronAPI) {
			await window.electronAPI.openAudioMIDISetup();
			// Move to next step after a delay
			setTimeout(() => nextStep(), 1000);
		}
	}

	async function nextStep() {
		if (currentStep < steps.length - 1) {
			currentStep++;
		} else {
			// Reset permission check before closing so app can recheck
			if (window.electronAPI && window.electronAPI.resetPermissionCheck) {
				await window.electronAPI.resetPermissionCheck();
			}
			onClose();
		}
	}

	function previousStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}
</script>

<div class="modal modal-open">
	<div class="modal-box max-w-2xl">
		<h3 class="font-bold text-lg mb-4">macOS System Audio Setup</h3>

		<!-- Progress indicator -->
		<div class="flex justify-center mb-6">
			{#each steps as _, i}
				<div class="flex items-center">
					<div class="w-8 h-8 rounded-full flex items-center justify-center {
						i === currentStep ? 'bg-primary text-white' :
						i < currentStep ? 'bg-success text-white' :
						'bg-base-300 text-base-content'
					}">
						{#if i < currentStep}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{:else}
							{i + 1}
						{/if}
					</div>
					{#if i < steps.length - 1}
						<div class="w-12 h-0.5 {i < currentStep ? 'bg-success' : 'bg-base-300'}"></div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Current step content -->
		<div class="mb-6">
			<h4 class="text-xl font-semibold mb-2">{steps[currentStep].title}</h4>
			<p class="text-base-content/70 mb-4">{steps[currentStep].description}</p>

			<ul class="list-decimal list-inside space-y-2 bg-base-200 p-4 rounded-lg">
				{#each steps[currentStep].details as detail}
					<li class="text-sm">{detail}</li>
				{/each}
			</ul>
		</div>

		<!-- Download progress -->
		{#if currentStep === 0 && isDownloading}
			<div class="mb-4">
				<div class="flex items-center gap-2 mb-2">
					<span class="loading loading-spinner loading-sm"></span>
					<span class="text-sm">Downloading BlackHole... {Math.round(downloadProgress)}%</span>
				</div>
				<progress class="progress progress-primary w-full" value={downloadProgress} max="100"></progress>
			</div>
		{/if}

		<!-- Download error -->
		{#if currentStep === 0 && downloadError}
			<div class="alert alert-error mb-4">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
				</svg>
				<div>
					<div class="font-bold">Download failed</div>
					<div class="text-sm">{downloadError}. Opening releases page as fallback...</div>
				</div>
			</div>
		{/if}

		<!-- Action buttons -->
		<div class="flex justify-between items-center">
			<button
				class="btn btn-ghost"
				onclick={previousStep}
				disabled={currentStep === 0}
			>
				Previous
			</button>

			<div class="flex gap-2">
				{#if currentStep === 0}
					<button class="btn btn-primary" onclick={downloadBlackHole} disabled={isDownloading}>
						{#if isDownloading}
							<span class="loading loading-spinner loading-sm"></span>
							Downloading...
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
							</svg>
							{steps[currentStep].action}
						{/if}
					</button>
				{:else if currentStep === 1}
					<button class="btn btn-primary" onclick={openAudioMIDISetup}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
							<path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
						</svg>
						{steps[currentStep].action}
					</button>
				{/if}

				<button class="btn btn-primary" onclick={nextStep}>
					{currentStep === steps.length - 1 ? 'Finish' : 'Next'}
					{#if currentStep < steps.length - 1}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
						</svg>
					{/if}
				</button>
			</div>
		</div>

		<!-- Skip/Close button -->
		<div class="mt-4 text-center">
			<button class="btn btn-sm btn-ghost" onclick={onClose}>
				I'll set this up later
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop" onclick={onClose}>
		<button type="button">close</button>
	</form>
</div>
