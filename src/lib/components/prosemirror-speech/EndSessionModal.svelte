<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		sessionName: string;
		onConfirm: (deleteContent: boolean) => void;
		onCancel: () => void;
	}

	let { sessionName, onConfirm, onCancel }: Props = $props();

	let deleteContent = $state(false);

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onCancel();
		}
	}

	function handleConfirm() {
		onConfirm(deleteContent);
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
		<h3 class="font-bold text-lg mb-4">
			{$_('end_session.title', { default: 'End Session?' })}
		</h3>

		<div class="py-4">
			<p class="mb-4">
				{$_('end_session.description', { default: 'Are you sure you want to end this session?' })}
			</p>

			<div class="bg-base-200 rounded-lg p-4 mb-4">
				<h4 class="font-semibold text-base">{sessionName}</h4>
			</div>

			<div class="form-control mb-4">
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="checkbox checkbox-error"
						bind:checked={deleteContent}
					/>
					<span class="label-text">
						{$_('end_session.delete_content', { default: 'Delete all content (text and speakers)' })}
					</span>
				</label>
			</div>

			{#if deleteContent}
				<div class="alert alert-error">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<span class="text-sm">
						{$_('end_session.delete_warning', { default: 'All transcription content and speakers will be permanently deleted. This cannot be undone.' })}
					</span>
				</div>
			{:else}
				<div class="alert alert-info">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span class="text-sm">
						{$_('end_session.keep_info', { default: 'The session will be marked as completed and content will be preserved for future reference.' })}
					</span>
				</div>
			{/if}
		</div>

		<div class="modal-action">
			<button
				type="button"
				class="btn btn-ghost"
				onclick={onCancel}
			>
				{$_('end_session.cancel', { default: 'Cancel' })}
			</button>
			<button
				type="button"
				class="btn btn-error"
				onclick={handleConfirm}
			>
				{$_('end_session.confirm', { default: 'End Session' })}
			</button>
		</div>
	</div>
</div>
