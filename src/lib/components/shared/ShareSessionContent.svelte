<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import QRCode from 'qrcode';
	import { fetchLatestRelease, getAssetForPlatform, type Platform } from '$lib/utils/overlay-download';
	import type { Participant } from '$lib/collaboration/types';

	interface Props {
		code: string;
		password?: string | null;
		sessionName?: string;
		scheduledDate?: string | null;
		participants?: Participant[];
		onClose: () => void;
	}

	let { code, password, sessionName, scheduledDate, participants = [], onClose }: Props = $props();

	let qrCodeDataUrl = $state<string>('');
	let copied = $state<'web' | 'overlay' | 'code' | 'email' | null>(null);
	let downloadError = $state<string | null>(null);
	let downloadUrls = $state<{ windows?: string; macos?: string; linux?: string }>({});

	// Get URLs with password if set
	const webViewerUrl = import.meta.env.VITE_WEB_VIEWER_URL || 'https://tekstiks.ee/kk';

	let webJoinUrl = $derived(() => {
		const base = `${webViewerUrl}/${code}`;
		return password
			? `${base}?password=${encodeURIComponent(password)}`
			: base;
	});

	let overlayDeepLink = $derived(() => {
		const base = `jutukuva://join/${code}`;
		return password
			? `${base}?password=${encodeURIComponent(password)}`
			: base;
	});

	// Generate QR code and fetch download URLs on mount
	onMount(async () => {
		try {
			qrCodeDataUrl = await QRCode.toDataURL(webJoinUrl(), {
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

		// Pre-fetch download URLs for email
		try {
			const release = await fetchLatestRelease();
			const windowsAsset = getAssetForPlatform(release.assets, 'windows');
			const macosAsset = getAssetForPlatform(release.assets, 'macos');
			const linuxAsset = getAssetForPlatform(release.assets, 'linux');
			downloadUrls = {
				windows: windowsAsset?.browser_download_url,
				macos: macosAsset?.browser_download_url,
				linux: linuxAsset?.browser_download_url
			};
		} catch (error) {
			console.error('Failed to fetch download URLs:', error);
		}
	});

	// Copy to clipboard
	async function copyToClipboard(text: string, type: 'web' | 'overlay' | 'code' | 'email') {
		try {
			await navigator.clipboard.writeText(text);
			copied = type;
			setTimeout(() => (copied = null), 2000);
		} catch (error) {
			console.error('Failed to copy:', error);
		}
	}

	// Generate email-friendly text
	function generateEmailText(): string {
		const lines: string[] = [];

		// Session info
		if (sessionName) {
			lines.push(sessionName);
			if (scheduledDate) {
				lines.push(formatDate(scheduledDate));
			}
			lines.push('');
		}

		// Web viewer link
		lines.push($_('share_session.email_web_viewer', { default: 'Join via web browser:' }));
		lines.push(webJoinUrl());
		lines.push('');

		// Session code
		lines.push($_('share_session.email_session_code', { default: 'Session code:' }) + ' ' + code);
		lines.push('');

		// Overlay app section
		lines.push($_('share_session.email_overlay_title', { default: 'Overlay Subtitles App (displays subtitles over any application):' }));
		if (downloadUrls.windows) {
			lines.push('Windows: ' + downloadUrls.windows);
		}
		if (downloadUrls.macos) {
			lines.push('macOS: ' + downloadUrls.macos);
		}
		if (downloadUrls.linux) {
			lines.push('Linux: ' + downloadUrls.linux);
		}
		lines.push('');
		lines.push($_('share_session.email_overlay_link', { default: 'Direct link (if app installed):' }) + ' ' + overlayDeepLink());

		return lines.join('\n');
	}

	// Copy all for email
	async function copyForEmail() {
		const emailText = generateEmailText();
		await copyToClipboard(emailText, 'email');
	}

	// Handle download
	async function handleDownload(platform: Platform) {
		try {
			downloadError = null;
			const release = await fetchLatestRelease();
			const asset = getAssetForPlatform(release.assets, platform);
			if (asset) {
				window.open(asset.browser_download_url, '_blank');
			} else {
				downloadError = $_('share_session.download_not_found', { default: 'Download not available for this platform' });
			}
		} catch (error) {
			console.error('Download failed:', error);
			downloadError = $_('share_session.download_error', { default: 'Failed to fetch download link' });
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div
	class="modal modal-open"
	onclick={handleBackdropClick}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<div class="modal-box max-w-2xl">
		<div class="flex items-center justify-between mb-6">
			<h3 class="font-bold text-xl">{$_('share_session.title', { default: 'Share Session' })}</h3>
			<button class="btn btn-primary gap-2" onclick={copyForEmail}>
				{#if copied === 'email'}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					{$_('share_session.copied', { default: 'Copied!' })}
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
					</svg>
					{$_('share_session.copy_for_email', { default: 'Copy for Email' })}
				{/if}
			</button>
		</div>

		<!-- Session Info (only if name or date provided) -->
		{#if sessionName || scheduledDate}
			<div class="bg-base-200 rounded-lg p-4 mb-6">
				<div class="flex items-center gap-2">
					{#if sessionName}
						<h4 class="font-semibold text-lg">{sessionName}</h4>
					{/if}
					{#if password}
						<span class="badge badge-warning badge-sm">{$_('share_session.password_protected', { default: 'Password Protected' })}</span>
					{/if}
				</div>
				{#if scheduledDate}
					<p class="text-sm text-base-content/70 mt-1">
						{formatDate(scheduledDate)}
					</p>
				{/if}
			</div>
		{/if}

		<!-- Section 1: Web Viewer URL (Primary) -->
		<div class="mb-8">
			<div class="flex items-center gap-2 mb-3">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
				</svg>
				<h4 class="font-semibold text-lg">
					{$_('share_session.web_viewer_section', { default: 'Web Viewer Link' })}
				</h4>
				{#if password}
					<span class="badge badge-warning badge-sm">{$_('share_session.password_included', { default: 'Password included' })}</span>
				{/if}
			</div>
			<div class="bg-base-200 rounded-lg p-4">
				<div class="flex gap-2 items-center">
					<input
						type="text"
						readonly
						value={webJoinUrl()}
						class="input input-bordered flex-1 font-mono text-sm bg-base-100"
						onclick={(e) => e.currentTarget.select()}
					/>
					<button class="btn btn-primary" onclick={() => copyToClipboard(webJoinUrl(), 'web')}>
						{#if copied === 'web'}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							{$_('share_session.copied', { default: 'Copied!' })}
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							{$_('share_session.copy_link', { default: 'Copy Link' })}
						{/if}
					</button>
				</div>
				<p class="text-sm text-base-content/60 mt-2">
					{$_('share_session.web_viewer_help', { default: 'Works on any device with a web browser' })}
				</p>
			</div>
		</div>

		<!-- Section 2: QR Code -->
		{#if qrCodeDataUrl}
			<div class="mb-8 flex flex-col items-center">
				<div class="bg-white p-4 rounded-xl shadow-lg">
					<img src={qrCodeDataUrl} alt="QR Code" class="w-48 h-48" />
				</div>
				<p class="text-sm text-base-content/60 mt-3">
					{$_('share_session.qr_help', { default: 'Scan with mobile device to join' })}
				</p>
			</div>
		{/if}

		<div class="divider"></div>

		<!-- Section 3: Overlay App -->
		<div class="mb-6">
			<div class="flex items-center gap-2 mb-3">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
				</svg>
				<h4 class="font-semibold text-lg">
					{$_('share_session.overlay_app_section', { default: 'Overlay Subtitles App' })}
				</h4>
			</div>
			<p class="text-sm text-base-content/60 mb-4">
				{$_('share_session.overlay_app_description', { default: 'Display subtitles over any application. Download the app for your platform:' })}
			</p>

			<!-- Download Buttons -->
			<div class="flex flex-wrap gap-3 mb-4">
				<button class="btn btn-outline btn-sm gap-2" onclick={() => handleDownload('windows')}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
						<path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
					</svg>
					Windows
				</button>
				<button class="btn btn-outline btn-sm gap-2" onclick={() => handleDownload('macos')}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
						<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
					</svg>
					macOS
				</button>
				<button class="btn btn-outline btn-sm gap-2" onclick={() => handleDownload('linux')}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.002c-.06-.135-.12-.2-.12-.2.096.066.127.2.127.2-.22-.133-.26-.266-.405-.466.298.935-.436 2.269-1.457 2.536-.136.035-.27.07-.4.135-.2.135-.336.267-.534.402-.164.129-.404.2-.618.2h-.013c-.492-.003-.814-.138-1.153-.402-.348-.2-.534-.135-.534-.135.136-.468.078-.534.103-.932.033-.676.334-1.468.467-1.802.135-.268.2-.534.166-.869v-.135h-.003a8.528 8.528 0 01-.135-.8c.2.333.333.666.333.666-.192-.197-.32-.47-.4-.735-.05-.18-.086-.37-.105-.56a1.5 1.5 0 00-.066.066c-.127.135-.26.332-.46.466-.333.27-.6.468-.935.668a.652.652 0 01-.135.068 1.27 1.27 0 01-.465.067c-.2-.003-.401-.067-.535-.2-.133-.133-.2-.333-.2-.6v-.067c.034-.065.067-.135.135-.2.067-.067.2-.132.267-.132h.008c.066 0 .13.006.203.03v-.002c-.003-.137.002-.267.033-.4l.003-.003c.1-.2.267-.4.533-.533.13-.065.332-.065.472-.065h.015c.2 0 .333.065.534.132.067.015.135.065.2.135v-.003c-.134-.199-.267-.332-.4-.468-.135-.135-.267-.2-.4-.2-.132-.067-.267-.135-.4-.2-.198-.067-.329-.333-.328-.533v-.003c.001-.067.034-.132.068-.2.067-.132.132-.198.27-.333.264-.267.668-.466 1.068-.666.132-.065.332-.135.464-.135.068 0 .133 0 .2.002-.002-.2-.002-.335-.068-.467a1.91 1.91 0 00-.267-.4c-.066-.067-.133-.135-.2-.2H9.77c-.466-.267-.667-.533-1.002-.8-.333-.2-.66-.4-1-.534-.268-.135-.6-.2-.867-.2h-.007c-.2 0-.334.067-.467.135h-.002l-.002-.002v.002c-.2.067-.333.199-.467.466-.066.065-.132.135-.132.265v.067c.001.133 0 .2.067.267v.002c.334.067.602.133.869.2.002.001.003.002.004.003h-.003c.066.067.065.135.065.2 0 .068-.065.133-.132.2h-.003c-.2.199-.534.333-.802.466-.466.2-.935.333-1.403.4a2.64 2.64 0 01-.134-.402c-.067-.2-.067-.332-.067-.465v-.002c0-.2.032-.332.1-.465.065-.133.065-.2.2-.267.065-.067.131-.135.198-.2.067-.066.133-.066.267-.2.133-.066.266-.132.4-.132.065.001.131-.002.2-.002h.003c-.066-.202-.1-.336-.066-.534.033-.2.1-.4.132-.535.067-.2.065-.333 0-.467-.065-.135-.133-.265-.198-.4a.327.327 0 00-.201-.002H8.2l-.002.002c-.133.066-.198.2-.266.333-.066.133-.134.333-.067.6-.001-.001-.002-.001-.002-.002-.199-.067-.333-.067-.533-.133a6.21 6.21 0 01-.533-.2c.133-.332.267-.532.533-.665.267-.133.334-.2.667-.2h.015c.135 0 .204.002.337.066.065.002.132.007.198.068.066.064.134.131.2.198.068.065.135.131.202.197h.002c.067.132.133.2.2.332l.002.003c.068.2.134.335.067.534-.067.202-.198.335-.332.4h-.002a.306.306 0 00-.066-.065 1.04 1.04 0 00-.202-.068l-.002-.001c-.133-.066-.266-.066-.334-.133-.065-.065-.132-.133-.198-.2-.068-.065-.067-.133-.067-.133s.066-.065.067-.2v-.065c0-.134-.068-.267-.2-.467a.585.585 0 00-.333-.2h-.005c-.067 0-.132.034-.199.067-.067.067-.132.2-.132.267 0 0-.003.003-.003.068v.002c.069.065.136.132.203.198.066.067.065.202.065.202-.002.198.065.333.198.468.135.13.268.332.335.465a.59.59 0 01.068.332c-.002.134-.068.269-.202.4-.133.135-.266.267-.398.332-.267.136-.533.202-.668.335a.899.899 0 00-.2.665c0 .135.067.267.134.4a.728.728 0 00.334.267c.133.067.2.067.333.134h.004c.066 0 .133 0 .198.065v-.002c.204.132.403.198.67.2.265.001.533.001.8-.133.198-.065.399-.135.599-.199.2-.068.4-.202.533-.335.133-.132.267-.266.4-.4.134-.13.2-.267.268-.398h-.001v.001l.002-.002h-.002l.001-.002c.068-.13.068-.268.136-.4.065-.132.065-.2.133-.33.065-.136.066-.27.133-.403.066-.133.065-.268.132-.4v-.004c0-.064.002-.133.068-.265v.002c.067-.2.133-.333.198-.533l.002-.002.001-.003c.133-.332.333-.865.468-1.064.132-.2.132-.335.265-.535.065-.133.133-.2.198-.332.066-.135.133-.265.267-.4.132-.132.198-.265.33-.398.136-.133.267-.199.4-.265h.016c.068 0 .133.005.201.065.065.067.065.133.065.2v.068a9.816 9.816 0 00-.537.799c-.065.133-.13.2-.195.332-.065.135-.136.267-.2.4-.067.135-.132.2-.132.334l-.003.003c-.065.197-.133.4-.198.598z"/>
					</svg>
					Linux
				</button>
			</div>

			{#if downloadError}
				<div class="alert alert-warning text-sm py-2 mb-4">
					{downloadError}
				</div>
			{/if}

			<!-- Deep Link -->
			<div class="flex gap-2 items-center">
				<input
					type="text"
					readonly
					value={overlayDeepLink()}
					class="input input-bordered flex-1 font-mono text-xs bg-base-100"
					onclick={(e) => e.currentTarget.select()}
				/>
				<button class="btn btn-secondary btn-sm" onclick={() => copyToClipboard(overlayDeepLink(), 'overlay')}>
					{#if copied === 'overlay'}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
					{/if}
					{$_('share_session.copy', { default: 'Copy' })}
				</button>
			</div>
			<p class="text-xs text-base-content/50 mt-2">
				{$_('share_session.overlay_link_help', { default: 'Opens the overlay app directly if installed' })}
			</p>
		</div>

		<div class="divider"></div>

		<!-- Section 4: Session Details (collapsed) -->
		<details class="collapse collapse-arrow bg-base-200 rounded-lg">
			<summary class="collapse-title font-medium">
				{$_('share_session.session_details', { default: 'Session Details' })}
			</summary>
			<div class="collapse-content">
				<!-- Session Code -->
				<div class="flex items-center gap-3 mb-4">
					<span class="font-mono text-2xl tracking-widest font-bold">{code}</span>
					{#if password}
						<span class="badge badge-warning">{$_('share_session.password_protected', { default: 'Password Protected' })}</span>
					{/if}
					<button class="btn btn-ghost btn-sm" onclick={() => copyToClipboard(code, 'code')}>
						{#if copied === 'code'}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
						{/if}
					</button>
				</div>

				<!-- Participants (only shown if provided) -->
				{#if participants.length > 0}
					<div>
						<p class="font-semibold mb-2">
							{$_('share_session.participants', { default: 'Connected Participants' })}
							<span class="badge badge-primary badge-sm ml-2">{participants.length}</span>
						</p>
						<div class="space-y-2">
							{#each participants as participant}
								<div class="flex items-center gap-2 p-2 bg-base-100 rounded">
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
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</details>

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
