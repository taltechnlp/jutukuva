<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		session: TranscriptionSession;
		onClose: () => void;
		onSessionUpdated: () => void;
	}

	let { session, onClose, onSessionUpdated }: Props = $props();

	let name = $state(session.name);
	let scheduledDate = $state('');
	let scheduledTime = $state('');
	let sessionPassword = $state(session.session_password || '');
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Parse existing scheduled date
	$effect(() => {
		if (session.scheduled_date) {
			const date = new Date(session.scheduled_date);
			scheduledDate = date.toISOString().split('T')[0];
			scheduledTime = date.toTimeString().slice(0, 5);
		}
	});

	async function handleSubmit() {
		if (!name.trim()) {
			error = $_('sessions.edit.nameRequired', { default: 'Session name is required' });
			return;
		}

		try {
			saving = true;
			error = null;

			const updateData: Partial<TranscriptionSession> = {
				name: name.trim()
			};

			// Update scheduled date if provided
			if (scheduledDate && scheduledTime) {
				updateData.scheduled_date = `${scheduledDate}T${scheduledTime}:00`;
			}

			// Update password (can be set, changed, or cleared)
			updateData.session_password = sessionPassword.trim() || null;

			await window.db.updateSession(session.id, updateData);

			onSessionUpdated();
		} catch (err) {
			console.error('Failed to update session:', err);
			error = $_('sessions.edit.failedToUpdate', { default: 'Failed to update session' });
			saving = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
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
	<div class="modal-box max-w-md">
		<h3 class="font-bold text-lg mb-4">{$_('sessions.edit.title', { default: 'Edit Session' })}</h3>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
			<!-- Session Name -->
			<div class="form-control mb-4">
				<label class="label" for="edit-session-name">
					<span class="label-text">{$_('sessions.edit.name', { default: 'Session Name' })} *</span>
				</label>
				<input
					id="edit-session-name"
					type="text"
					placeholder={$_('sessions.edit.namePlaceholder', { default: 'e.g., Team Meeting, Interview Session' })}
					class="input input-bordered w-full"
					bind:value={name}
					disabled={saving}
					required
				/>
			</div>

			<!-- Session Code (Read-only) -->
			<div class="form-control mb-4">
				<label class="label" for="edit-session-code">
					<span class="label-text">{$_('sessions.edit.sessionCode', { default: 'Session Code' })}</span>
				</label>
				<div class="input input-bordered flex items-center font-mono text-lg tracking-widest bg-base-200">
					{session.session_code || '-'}
				</div>
				<p class="label-text-alt text-base-content/60 px-1 mt-1">
					{$_('sessions.edit.codeReadonly', { default: 'Session code cannot be changed' })}
				</p>
			</div>

			<!-- Date -->
			{#if session.status === 'planned'}
				<div class="form-control mb-4">
					<label class="label" for="edit-session-date">
						<span class="label-text">{$_('sessions.edit.date', { default: 'Date' })}</span>
					</label>
					<input
						id="edit-session-date"
						type="date"
						class="input input-bordered w-full"
						bind:value={scheduledDate}
						disabled={saving}
					/>
				</div>

				<!-- Time -->
				<div class="form-control mb-4">
					<label class="label" for="edit-session-time">
						<span class="label-text">{$_('sessions.edit.time', { default: 'Time' })}</span>
					</label>
					<input
						id="edit-session-time"
						type="time"
						class="input input-bordered w-full"
						bind:value={scheduledTime}
						disabled={saving}
					/>
				</div>
			{/if}

			<!-- Password -->
			<div class="form-control mb-4">
				<label class="label" for="edit-session-password">
					<span class="label-text">{$_('sessions.edit.password', { default: 'Password' })}</span>
				</label>
				<input
					id="edit-session-password"
					type="password"
					placeholder={$_('sessions.edit.passwordPlaceholder', { default: 'Leave empty for no password' })}
					class="input input-bordered w-full"
					bind:value={sessionPassword}
					disabled={saving}
				/>
				{#if session.session_password}
					<p class="label-text-alt text-info px-1 mt-1">
						{$_('sessions.edit.passwordSet', { default: 'This session currently has a password set' })}
					</p>
				{:else}
					<p class="label-text-alt text-base-content/60 px-1 mt-1">
						{$_('sessions.edit.passwordHint', { default: 'Add a password to restrict access to this session' })}
					</p>
				{/if}
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="alert alert-error mb-4">
					<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<!-- Actions -->
			<div class="modal-action">
				<button
					type="button"
					class="btn btn-ghost"
					onclick={onClose}
					disabled={saving}
				>
					{$_('sessions.edit.cancel', { default: 'Cancel' })}
				</button>
				<button
					type="submit"
					class="btn btn-primary"
					disabled={saving}
				>
					{#if saving}
						<span class="loading loading-spinner"></span>
						{$_('sessions.edit.saving', { default: 'Saving...' })}
					{:else}
						{$_('sessions.edit.submit', { default: 'Save Changes' })}
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
