<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { SessionInfo, Participant } from '$lib/collaboration/types';

	// Props
	let {
		sessionInfo,
		participants = [],
		connected = false,
		onShowShareModal
	}: {
		sessionInfo: SessionInfo | null;
		participants: Participant[];
		connected: boolean;
		onShowShareModal?: () => void;
	} = $props();

	// Get participant count (excluding self)
	const otherParticipants = $derived(participants.filter((p) => p.role !== sessionInfo?.role).length);
</script>

{#if sessionInfo}
	<div class="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
		<!-- Connection Status -->
		<div class="flex items-center gap-2">
			<div class="relative">
				<div
					class="w-3 h-3 rounded-full {connected ? 'bg-success' : 'bg-error'}"
				></div>
				{#if connected}
					<div class="absolute inset-0 w-3 h-3 rounded-full bg-success animate-ping"></div>
				{/if}
			</div>
			<span class="text-sm font-medium">
				{#if connected}
					{$_('session_status.connected', { default: 'Connected' })}
				{:else}
					{$_('session_status.connecting', { default: 'Connecting...' })}
				{/if}
			</span>
		</div>

		<!-- Session Code -->
		<div class="divider divider-horizontal"></div>
		<div class="flex items-center gap-2">
			<span class="text-sm text-base-content/60">
				{$_('session_status.session', { default: 'Session' })}:
			</span>
			<code class="font-mono font-bold text-primary">{sessionInfo.code}</code>
		</div>

		<!-- Role Badge -->
		<div class="badge {sessionInfo.role === 'host' ? 'badge-primary' : 'badge-secondary'}">
			{sessionInfo.role === 'host'
				? $_('session_status.host', { default: 'Host' })
				: $_('session_status.guest', { default: 'Guest' })}
		</div>

		<!-- Participant Count -->
		{#if connected && participants.length > 1}
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
					/>
				</svg>
				<span class="text-sm">
					{participants.length} {participants.length === 1
						? $_('session_status.participant', { default: 'participant' })
						: $_('session_status.participants', { default: 'participants' })}
				</span>
			</div>
		{/if}

		<!-- Share Button (Host only) -->
		{#if sessionInfo.role === 'host' && onShowShareModal}
			<div class="ml-auto">
				<button class="btn btn-sm btn-outline gap-2" onclick={onShowShareModal}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
						/>
					</svg>
					{$_('session_status.share', { default: 'Share' })}
				</button>
			</div>
		{/if}

		<!-- Leave Button (Guest only) -->
		{#if sessionInfo.role === 'guest'}
			<div class="ml-auto">
				<button
					class="btn btn-sm btn-error btn-outline"
					onclick={() => window.location.reload()}
				>
					{$_('session_status.leave', { default: 'Leave Session' })}
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.divider-horizontal {
		width: 1px;
		height: 24px;
	}

	@keyframes ping {
		75%,
		100% {
			transform: scale(2);
			opacity: 0;
		}
	}

	.animate-ping {
		animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
	}
</style>
