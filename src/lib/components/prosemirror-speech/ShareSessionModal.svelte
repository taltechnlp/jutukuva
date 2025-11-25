<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import QRCode from 'qrcode';
	import type { SessionInfo, Participant } from '$lib/collaboration/types';

	// Props
	let {
		sessionInfo,
		participants = [],
		onClose
	}: {
		sessionInfo: SessionInfo;
		participants: Participant[];
		onClose: () => void;
	} = $props();

	let qrCodeDataUrl = $state<string>('');
	let copied = $state<'code' | 'url' | 'web' | null>(null);

	// Detect platform
	const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
	const isMobile = typeof window !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

	// Get URLs
	const webViewerUrl = import.meta.env.VITE_WEB_VIEWER_URL || 'https://tekstiks.ee/kk';
	const webJoinUrl = `${webViewerUrl}/${sessionInfo.code}`;
	const electronJoinUrl = `kirikaja://join/${sessionInfo.code}`;
	const desktopJoinUrl = electronJoinUrl;

	// Generate QR code on mount (always use web viewer URL for mobile compatibility)
	onMount(async () => {
		try {
			qrCodeDataUrl = await QRCode.toDataURL(webJoinUrl, {
				width: 256,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#ffffff'
				}
			});
		} catch (error) {
			console.error('Failed to generate QR code:', error);
		}
	});

	// Copy to clipboard
	async function copyToClipboard(text: string, type: 'code' | 'url' | 'web') {
		try {
			await navigator.clipboard.writeText(text);
			copied = type;
			setTimeout(() => (copied = null), 2000);
		} catch (error) {
			console.error('Failed to copy:', error);
		}
	}
</script>

<div class="modal modal-open">
	<div class="modal-box max-w-2xl">
		<h3 class="font-bold text-xl mb-4">{$_('share_session.title', { default: 'Share Session' })}</h3>

		<!-- Session Code -->
		<div class="mb-6">
			<label class="label">
				<span class="label-text font-semibold">
					{$_('share_session.code_label', { default: 'Session Code' })}
				</span>
			</label>
			<div class="flex gap-2">
				<input
					type="text"
					readonly
					value={sessionInfo.code}
					class="input input-bordered flex-1 text-3xl font-mono text-center tracking-widest"
					onclick={(e) => e.currentTarget.select()}
				/>
				<button
					class="btn btn-primary"
					onclick={() => copyToClipboard(sessionInfo.code, 'code')}
				>
					{#if copied === 'code'}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						{$_('share_session.copied', { default: 'Copied!' })}
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
						{$_('share_session.copy', { default: 'Copy' })}
					{/if}
				</button>
			</div>
			<label class="label">
				<span class="label-text-alt">
					{$_('share_session.code_help', { default: 'Share this code with others to join your session' })}
				</span>
			</label>
		</div>

		<!-- Web Viewer URL (for mobile/QR) -->
		<div class="mb-6">
			<label class="label">
				<span class="label-text font-semibold">
					{$_('share_session.web_url_label', { default: 'Web Viewer URL' })}
				</span>
			</label>
			<div class="flex gap-2">
				<input
					type="text"
					readonly
					value={webJoinUrl}
					class="input input-bordered flex-1 font-mono text-sm"
					onclick={(e) => e.currentTarget.select()}
				/>
				<button
					class="btn btn-secondary"
					onclick={() => copyToClipboard(webJoinUrl, 'web')}
				>
					{#if copied === 'web'}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						{$_('share_session.copied', { default: 'Copied!' })}
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
						{$_('share_session.copy', { default: 'Copy' })}
					{/if}
				</button>
			</div>
			<label class="label">
				<span class="label-text-alt">
					{$_('share_session.web_url_help', { default: 'Works on any device with a web browser' })}
				</span>
			</label>
		</div>

		<!-- Desktop App URL (optional) -->
		{#if isElectron}
		<div class="mb-6">
			<label class="label">
				<span class="label-text font-semibold">
					{$_('share_session.desktop_url_label', { default: 'Desktop App URL' })}
				</span>
			</label>
			<div class="flex gap-2">
				<input
					type="text"
					readonly
					value={desktopJoinUrl}
					class="input input-bordered flex-1 font-mono text-sm"
					onclick={(e) => e.currentTarget.select()}
				/>
				<button
					class="btn btn-outline"
					onclick={() => copyToClipboard(desktopJoinUrl, 'url')}
				>
					{#if copied === 'url'}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						{$_('share_session.copied', { default: 'Copied!' })}
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
						{$_('share_session.copy', { default: 'Copy' })}
					{/if}
				</button>
			</div>
			<label class="label">
				<span class="label-text-alt">
					{$_('share_session.desktop_url_help', { default: 'For users with desktop app installed' })}
				</span>
			</label>
		</div>
		{/if}

		<!-- QR Code -->
		{#if qrCodeDataUrl}
			<div class="mb-6 flex flex-col items-center">
				<label class="label">
					<span class="label-text font-semibold">
						{$_('share_session.qr_label', { default: 'QR Code' })}
					</span>
				</label>
				<div class="bg-white p-4 rounded-lg">
					<img src={qrCodeDataUrl} alt="QR Code" class="w-64 h-64" />
				</div>
				<label class="label">
					<span class="label-text-alt">
						{$_('share_session.qr_help', { default: 'Scan with mobile device to join' })}
					</span>
				</label>
			</div>
		{/if}

		<!-- Connected Participants -->
		<div class="mb-4">
			<label class="label">
				<span class="label-text font-semibold">
					{$_('share_session.participants', { default: 'Connected Participants' })}
					<span class="badge badge-primary ml-2">{participants.length}</span>
				</span>
			</label>
			<div class="space-y-2">
				{#each participants as participant}
					<div class="flex items-center gap-2 p-2 bg-base-200 rounded">
						<div
							class="w-3 h-3 rounded-full"
							style="background-color: {participant.color}"
						></div>
						<span class="flex-1">{participant.name}</span>
						{#if participant.role === 'host'}
							<span class="badge badge-sm badge-primary">{$_('share_session.host', { default: 'Host' })}</span>
						{:else}
							<span class="badge badge-sm">{$_('share_session.guest', { default: 'Guest' })}</span>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-base-content/60">
						{$_('share_session.no_participants', { default: 'No other participants yet' })}
					</p>
				{/each}
			</div>
		</div>

		<!-- Close button -->
		<div class="modal-action">
			<button class="btn" onclick={onClose}>
				{$_('share_session.close', { default: 'Close' })}
			</button>
		</div>
	</div>
</div>

<style>
	.modal-box {
		max-height: 90vh;
		overflow-y: auto;
	}
</style>
