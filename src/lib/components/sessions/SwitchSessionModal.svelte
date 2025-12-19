<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		currentSessionName: string;
		newSessionName: string;
		isRecording: boolean;
		isHost: boolean;
		onLeave: () => void;
		onEnd: () => void;
		onCancel: () => void;
	}

	let { currentSessionName, newSessionName, isRecording, isHost, onLeave, onEnd, onCancel }: Props = $props();

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onCancel();
		}
	}
</script>

<div
	class="modal modal-open"
	onclick={handleBackdropClick}
	onkeydown={(e) => e.key === 'Escape' && onCancel()}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<div class="modal-box max-w-md">
		<h3 class="font-bold text-lg mb-4">{$_('sessions.switch.title', { default: 'Switch Session?' })}</h3>

		<div class="space-y-4">
			<p class="text-base-content/80">
				{$_('sessions.switch.message', { default: 'You are currently in an active session.' })}
			</p>

			<!-- Current session info -->
			<div class="bg-base-200 rounded-lg p-3">
				<div class="text-xs text-base-content/60 mb-1">
					{$_('sessions.switch.currentSession', { default: 'Current session:' })}
				</div>
				<div class="font-medium">{currentSessionName}</div>
			</div>

			<!-- New session info -->
			<div class="bg-primary/10 rounded-lg p-3 border border-primary/20">
				<div class="text-xs text-base-content/60 mb-1">
					{$_('sessions.switch.newSession', { default: 'New session:' })}
				</div>
				<div class="font-medium">{newSessionName}</div>
			</div>

			<!-- Recording warning -->
			{#if isRecording}
				<div class="alert alert-warning py-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<span class="text-sm">{$_('sessions.switch.recordingWarning', { default: 'Recording is active and will be stopped.' })}</span>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="modal-action flex flex-col gap-2 mt-6">
			<!-- Leave option -->
			<button
				class="btn btn-outline btn-block justify-start gap-3"
				onclick={onLeave}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
				</svg>
				<div class="flex flex-col items-start">
					<span>{$_('sessions.switch.leaveAndSwitch', { default: 'Leave & Switch' })}</span>
					<span class="text-xs opacity-70 font-normal">{$_('sessions.switch.leaveHint', { default: 'Disconnect but keep session active' })}</span>
				</div>
			</button>

			<!-- End option (only for hosts) -->
			{#if isHost}
				<button
					class="btn btn-outline btn-warning btn-block justify-start gap-3"
					onclick={onEnd}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<div class="flex flex-col items-start">
						<span>{$_('sessions.switch.endAndSwitch', { default: 'End & Switch' })}</span>
						<span class="text-xs opacity-70 font-normal">{$_('sessions.switch.endHint', { default: 'Mark current session as completed' })}</span>
					</div>
				</button>
			{/if}

			<!-- Cancel -->
			<button
				class="btn btn-ghost btn-block mt-2"
				onclick={onCancel}
			>
				{$_('sessions.switch.cancel', { default: 'Cancel' })}
			</button>
		</div>
	</div>
</div>
