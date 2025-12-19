<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { generateSessionCode, isValidSessionCode, normalizeSessionCode } from '$lib/collaboration/sessionCode';

	interface Props {
		onClose: () => void;
		onSessionCreated: () => void;
	}

	let { onClose, onSessionCreated }: Props = $props();

	let name = $state('');
	let scheduledDate = $state('');
	let scheduledTime = $state('');
	let description = $state('');
	let sessionCode = $state('');
	let sessionPassword = $state('');
	let useCustomCode = $state(false);
	let creating = $state(false);
	let error = $state<string | null>(null);

	// Generate initial code
	let generatedCode = $state(generateSessionCode());

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

	function regenerateCode() {
		generatedCode = generateSessionCode();
	}

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		// Normalize input: uppercase, remove invalid chars
		sessionCode = normalizeSessionCode(input.value).slice(0, 6);
	}

	async function handleSubmit() {
		if (!name.trim()) {
			error = $_('sessions.create.nameRequired', { default: 'Session name is required' });
			return;
		}

		if (!scheduledDate || !scheduledTime) {
			error = $_('sessions.create.dateTimeRequired', { default: 'Date and time are required' });
			return;
		}

		// Determine session ID (custom or generated)
		const sessionId = useCustomCode ? sessionCode : generatedCode;

		// Validate session code
		if (!isValidSessionCode(sessionId)) {
			error = $_('sessions.create.invalidCode', { default: 'Session code must be 6 characters (A-Z, 2-9, no O/0/I/1/L)' });
			return;
		}

		try {
			creating = true;
			error = null;

			// Combine date and time into ISO format
			const dateTimeString = `${scheduledDate}T${scheduledTime}:00`;

			// Create session in database
			await window.db.createSession(sessionId, name.trim(), dateTimeString, description.trim() || null);

			// Update session with password if provided
			if (sessionPassword.trim()) {
				await window.db.updateSession(sessionId, { session_password: sessionPassword.trim() });
			}

			// Notify parent component
			onSessionCreated();
		} catch (err) {
			console.error('Failed to create session:', err);
			error = $_('sessions.create.failedToCreate', { default: 'Failed to create session' });
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
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
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

			<!-- Session Code -->
			<div class="form-control mb-4">
				<label class="label" for="session-code">
					<span class="label-text">{$_('sessions.create.sessionCode', { default: 'Session Code' })}</span>
				</label>

				<div class="flex items-center gap-2 mb-2">
					<label class="label cursor-pointer gap-2">
						<input
							type="radio"
							name="code-type"
							class="radio radio-sm"
							checked={!useCustomCode}
							onchange={() => useCustomCode = false}
							disabled={creating}
						/>
						<span class="label-text">{$_('sessions.create.autoGenerate', { default: 'Auto-generate' })}</span>
					</label>
					<label class="label cursor-pointer gap-2">
						<input
							type="radio"
							name="code-type"
							class="radio radio-sm"
							checked={useCustomCode}
							onchange={() => useCustomCode = true}
							disabled={creating}
						/>
						<span class="label-text">{$_('sessions.create.customCode', { default: 'Custom code' })}</span>
					</label>
				</div>

				{#if useCustomCode}
					<input
						id="session-code"
						type="text"
						placeholder={$_('sessions.create.codePlaceholder', { default: 'e.g. ABC123' })}
						class="input input-bordered w-full font-mono text-lg tracking-widest session-code-input"
						value={sessionCode}
						oninput={handleCodeInput}
						disabled={creating}
						maxlength="6"
					/>
					<p class="label-text-alt text-base-content/60 px-1 mt-1">
						{$_('sessions.create.codeHint', { default: 'Use letters A-Z (except O, I, L) and numbers 2-9' })}
					</p>
				{:else}
					<div class="flex items-center gap-2">
						<div class="input input-bordered flex-1 flex items-center font-mono text-lg tracking-widest bg-base-200">
							{generatedCode}
						</div>
						<button
							type="button"
							class="btn btn-square btn-ghost"
							onclick={regenerateCode}
							disabled={creating}
							title={$_('sessions.create.regenerate', { default: 'Generate new code' })}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
						</button>
					</div>
				{/if}
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

			<!-- Password (Optional) -->
			<div class="form-control mb-4">
				<label class="label" for="session-password">
					<span class="label-text">{$_('sessions.create.password', { default: 'Password (optional)' })}</span>
				</label>
				<input
					id="session-password"
					type="password"
					placeholder={$_('sessions.create.passwordPlaceholder', { default: 'Leave empty for no password' })}
					class="input input-bordered w-full"
					bind:value={sessionPassword}
					disabled={creating}
				/>
				<p class="label-text-alt text-warning px-1 mt-1">
					{$_('sessions.create.passwordHint', { default: 'If set, viewers will need this password to join' })}
				</p>
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

<style>
	.session-code-input {
		text-transform: uppercase;
	}
	.session-code-input::placeholder {
		text-transform: none;
	}
</style>
