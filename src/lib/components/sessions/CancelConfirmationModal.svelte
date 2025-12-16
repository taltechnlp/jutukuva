<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		session: TranscriptionSession;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { session, onConfirm, onCancel }: Props = $props();

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onCancel();
		}
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'N/A';
		const date = new Date(dateString);
		return date.toLocaleString('en-US', {
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
	onkeydown={(e) => e.key === 'Escape' && onCancel()}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<div class="modal-box max-w-md">
		<h3 class="font-bold text-lg mb-4">{$_('sessions.cancelModal.title', { default: 'Cancel Session?' })}</h3>

		<div class="py-4">
			<p class="mb-4">{$_('sessions.cancelModal.confirm', { default: 'Are you sure you want to cancel this session?' })}</p>

			<div class="bg-base-200 rounded-lg p-4 mb-4">
				<h4 class="font-semibold text-base mb-2">{session.name}</h4>
				{#if session.scheduled_date}
					<p class="text-sm text-base-content/70">
						{$_('sessions.cancelModal.scheduledFor', { default: 'Scheduled for' })}: {formatDate(session.scheduled_date)}
					</p>
				{/if}
				{#if session.session_code}
					<p class="text-sm text-base-content/70">
						{$_('sessions.cancelModal.sessionCode', { default: 'Session Code' })}: {session.session_code}
					</p>
				{/if}
			</div>

			<div class="alert alert-warning">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<span class="text-sm">{$_('sessions.cancelModal.warning', { default: 'This action will mark the session as cancelled. The session will remain in your history but cannot be activated.' })}</span>
			</div>
		</div>

		<div class="modal-action">
			<button
				type="button"
				class="btn btn-ghost"
				onclick={onCancel}
			>
				{$_('sessions.cancelModal.keep', { default: 'Keep Session' })}
			</button>
			<button
				type="button"
				class="btn btn-error"
				onclick={onConfirm}
			>
				{$_('sessions.cancelModal.cancel', { default: 'Cancel Session' })}
			</button>
		</div>
	</div>
</div>
