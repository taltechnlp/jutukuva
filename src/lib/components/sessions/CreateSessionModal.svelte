<script lang="ts">
	import { nanoid } from 'nanoid';
	import { _ } from 'svelte-i18n';

	interface Props {
		onClose: () => void;
		onSessionCreated: () => void;
	}

	let { onClose, onSessionCreated }: Props = $props();

	let name = $state('');
	let scheduledDate = $state('');
	let scheduledTime = $state('');
	let description = $state('');
	let creating = $state(false);
	let error = $state<string | null>(null);

	// Set default date/time to current time + 1 hour
	$effect(() => {
		const now = new Date();
		now.setHours(now.getHours() + 1);
		now.setMinutes(0);

		const dateStr = now.toISOString().split('T')[0];
		const timeStr = now.toTimeString().slice(0, 5);

		scheduledDate = dateStr;
		scheduledTime = timeStr;
	});

	async function handleSubmit() {
		if (!name.trim()) {
			error = $_('sessions.create.nameRequired', { default: 'Session name is required' });
			return;
		}

		if (!scheduledDate || !scheduledTime) {
			error = $_('sessions.create.dateTimeRequired', { default: 'Date and time are required' });
			return;
		}

		try {
			creating = true;
			error = null;

			// Combine date and time into ISO format
			const dateTimeString = `${scheduledDate}T${scheduledTime}:00`;

			// Generate session ID
			const sessionId = nanoid(6).toUpperCase();

			// Create session in database
			await window.db.createSession(sessionId, name.trim(), dateTimeString, description.trim() || null);

			// Notify parent component
			onSessionCreated();
		} catch (err) {
			console.error('Failed to create session:', err);
			error = 'Failed to create session';
			creating = false;
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
	role="dialog"
	aria-modal="true"
>
	<div class="modal-box max-w-md">
		<h3 class="font-bold text-lg mb-4">{$_('sessions.create.title', { default: 'Create New Session' })}</h3>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
			<!-- Session Name -->
			<div class="form-control mb-4">
				<label class="label" for="session-name">
					<span class="label-text">{$_('sessions.create.name', { default: 'Session Name' })} *</span>
				</label>
				<input
					id="session-name"
					type="text"
					placeholder={$_('sessions.create.namePlaceholder', { default: 'e.g., Team Meeting, Interview Session' })}
					class="input input-bordered w-full"
					bind:value={name}
					disabled={creating}
					required
				/>
			</div>

			<!-- Date -->
			<div class="form-control mb-4">
				<label class="label" for="session-date">
					<span class="label-text">{$_('sessions.create.date', { default: 'Date' })} *</span>
				</label>
				<input
					id="session-date"
					type="date"
					class="input input-bordered w-full"
					bind:value={scheduledDate}
					disabled={creating}
					required
				/>
			</div>

			<!-- Time -->
			<div class="form-control mb-4">
				<label class="label" for="session-time">
					<span class="label-text">{$_('sessions.create.time', { default: 'Time' })} *</span>
				</label>
				<input
					id="session-time"
					type="time"
					class="input input-bordered w-full"
					bind:value={scheduledTime}
					disabled={creating}
					required
				/>
			</div>

			<!-- Description (Optional) -->
			<div class="form-control mb-4">
				<label class="label" for="session-description">
					<span class="label-text">{$_('sessions.create.description', { default: 'Description (optional)' })}</span>
				</label>
				<textarea
					id="session-description"
					placeholder={$_('sessions.create.descriptionPlaceholder', { default: 'Add notes about this session...' })}
					class="textarea textarea-bordered w-full h-24"
					bind:value={description}
					disabled={creating}
				></textarea>
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
					disabled={creating}
				>
					{$_('sessions.create.cancel', { default: 'Cancel' })}
				</button>
				<button
					type="submit"
					class="btn btn-primary"
					disabled={creating}
				>
					{#if creating}
						<span class="loading loading-spinner"></span>
						{$_('sessions.create.creating', { default: 'Creating...' })}
					{:else}
						{$_('sessions.create.submit', { default: 'Create Session' })}
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
