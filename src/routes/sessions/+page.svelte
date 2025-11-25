<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { _ } from 'svelte-i18n';
	import CreateSessionModal from '$lib/components/sessions/CreateSessionModal.svelte';
	import CancelConfirmationModal from '$lib/components/sessions/CancelConfirmationModal.svelte';
	import SessionCard from '$lib/components/sessions/SessionCard.svelte';

	type ViewMode = 'upcoming' | 'active' | 'past' | 'all';

	let sessions = $state<TranscriptionSession[]>([]);
	let filteredSessions = $state<TranscriptionSession[]>([]);
	let viewMode = $state<ViewMode>('upcoming');
	let showCreateModal = $state(false);
	let showCancelModal = $state(false);
	let sessionToCancel = $state<TranscriptionSession | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadSessions();
	});

	async function loadSessions() {
		try {
			loading = true;
			error = null;
			sessions = await window.db.getAllSessions();
			filterSessions();
		} catch (err) {
			console.error('Failed to load sessions:', err);
			error = 'Failed to load sessions';
		} finally {
			loading = false;
		}
	}

	function filterSessions() {
		const now = new Date();

		switch (viewMode) {
			case 'upcoming':
				filteredSessions = sessions.filter(s =>
					s.status === 'planned' &&
					s.scheduled_date &&
					new Date(s.scheduled_date) >= now
				).sort((a, b) => {
					const dateA = new Date(a.scheduled_date!);
					const dateB = new Date(b.scheduled_date!);
					return dateA.getTime() - dateB.getTime();
				});
				break;
			case 'active':
				filteredSessions = sessions.filter(s => s.status === 'active');
				break;
			case 'past':
				filteredSessions = sessions.filter(s =>
					s.status === 'completed' ||
					s.status === 'cancelled' ||
					(s.status === 'planned' && s.scheduled_date && new Date(s.scheduled_date) < now)
				).sort((a, b) => {
					const dateA = new Date(a.scheduled_date || a.created_at);
					const dateB = new Date(b.scheduled_date || b.created_at);
					return dateB.getTime() - dateA.getTime();
				});
				break;
			case 'all':
				filteredSessions = sessions.sort((a, b) => {
					const dateA = new Date(a.scheduled_date || a.created_at);
					const dateB = new Date(b.scheduled_date || b.created_at);
					return dateB.getTime() - dateA.getTime();
				});
				break;
		}
	}

	function changeViewMode(mode: ViewMode) {
		viewMode = mode;
		filterSessions();
	}

	async function handleActivateSession(session: TranscriptionSession) {
		try {
			await window.db.activateSession(session.id);
			// Navigate to main page with session activated
			goto(`/?session=${session.id}`);
		} catch (err) {
			console.error('Failed to activate session:', err);
			alert('Failed to activate session');
		}
	}

	async function handleCompleteSession(session: TranscriptionSession) {
		try {
			await window.db.completeSession(session.id);
			await loadSessions();
		} catch (err) {
			console.error('Failed to complete session:', err);
			alert('Failed to complete session');
		}
	}

	function handleCancelSession(session: TranscriptionSession) {
		sessionToCancel = session;
		showCancelModal = true;
	}

	async function confirmCancelSession() {
		if (!sessionToCancel) return;

		try {
			await window.db.cancelSession(sessionToCancel.id);
			showCancelModal = false;
			sessionToCancel = null;
			await loadSessions();
		} catch (err) {
			console.error('Failed to cancel session:', err);
			alert('Failed to cancel session');
		}
	}

	async function handleEditSession(session: TranscriptionSession) {
		// TODO: Implement edit functionality
		console.log('Edit session:', session);
	}

	async function handleSessionCreated() {
		showCreateModal = false;
		await loadSessions();
	}

	function getSessionCountByStatus(status: ViewMode): number {
		if (status === 'all') return sessions.length;

		const now = new Date();

		switch (status) {
			case 'upcoming':
				return sessions.filter(s =>
					s.status === 'planned' &&
					s.scheduled_date &&
					new Date(s.scheduled_date) >= now
				).length;
			case 'active':
				return sessions.filter(s => s.status === 'active').length;
			case 'past':
				return sessions.filter(s =>
					s.status === 'completed' ||
					s.status === 'cancelled' ||
					(s.status === 'planned' && s.scheduled_date && new Date(s.scheduled_date) < now)
				).length;
			default:
				return 0;
		}
	}
</script>

<div class="min-h-screen bg-base-200 p-6">
	<div class="max-w-6xl mx-auto">
		<!-- Header -->
		<div class="flex justify-between items-center mb-6">
			<div>
				<h1 class="text-3xl font-bold">{$_('sessions.title', { default: 'Sessions' })}</h1>
				<p class="text-base-content/70 mt-1">{$_('sessions.description', { default: 'Manage your transcription sessions' })}</p>
			</div>
			<div class="flex gap-2">
				<button
					class="btn btn-ghost"
					onclick={() => goto('/')}
				>
					{$_('sessions.backToEditor', { default: 'Back to Editor' })}
				</button>
				<button
					class="btn btn-primary"
					onclick={() => showCreateModal = true}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
					</svg>
					{$_('sessions.newSession', { default: 'New Session' })}
				</button>
			</div>
		</div>

		<!-- View Mode Tabs -->
		<div class="tabs tabs-boxed bg-base-100 mb-6 p-1">
			<button
				class={`tab ${viewMode === 'upcoming' ? 'tab-active' : ''}`}
				onclick={() => changeViewMode('upcoming')}
			>
				{$_('sessions.tabs.upcoming', { default: 'Upcoming' })} ({getSessionCountByStatus('upcoming')})
			</button>
			<button
				class={`tab ${viewMode === 'active' ? 'tab-active' : ''}`}
				onclick={() => changeViewMode('active')}
			>
				{$_('sessions.tabs.active', { default: 'Active' })} ({getSessionCountByStatus('active')})
			</button>
			<button
				class={`tab ${viewMode === 'past' ? 'tab-active' : ''}`}
				onclick={() => changeViewMode('past')}
			>
				{$_('sessions.tabs.past', { default: 'Past' })} ({getSessionCountByStatus('past')})
			</button>
			<button
				class={`tab ${viewMode === 'all' ? 'tab-active' : ''}`}
				onclick={() => changeViewMode('all')}
			>
				{$_('sessions.tabs.all', { default: 'All' })} ({getSessionCountByStatus('all')})
			</button>
		</div>

		<!-- Loading State -->
		{#if loading}
			<div class="flex justify-center items-center py-12">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{/if}

		<!-- Error State -->
		{#if error}
			<div class="alert alert-error">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		<!-- Sessions List -->
		{#if !loading && !error}
			{#if filteredSessions.length === 0}
				<div class="text-center py-12">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-base-content/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					<h3 class="text-xl font-semibold text-base-content/70 mb-2">{$_('sessions.empty.title', { default: 'No sessions found' })}</h3>
					<p class="text-base-content/50 mb-4">
						{#if viewMode === 'upcoming'}
							{$_('sessions.empty.upcoming', { default: "You don't have any upcoming sessions scheduled." })}
						{:else if viewMode === 'active'}
							{$_('sessions.empty.active', { default: "You don't have any active sessions." })}
						{:else if viewMode === 'past'}
							{$_('sessions.empty.past', { default: "You don't have any past sessions." })}
						{:else}
							{$_('sessions.empty.all', { default: "You haven't created any sessions yet." })}
						{/if}
					</p>
					<button
						class="btn btn-primary"
						onclick={() => showCreateModal = true}
					>
						{$_('sessions.empty.createFirst', { default: 'Plan a New Session' })}
					</button>
				</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each filteredSessions as session (session.id)}
						<SessionCard
							{session}
							onActivate={() => handleActivateSession(session)}
							onComplete={() => handleCompleteSession(session)}
							onCancel={() => handleCancelSession(session)}
							onEdit={() => handleEditSession(session)}
						/>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Modals -->
{#if showCreateModal}
	<CreateSessionModal
		onClose={() => showCreateModal = false}
		onSessionCreated={handleSessionCreated}
	/>
{/if}

{#if showCancelModal && sessionToCancel}
	<CancelConfirmationModal
		session={sessionToCancel}
		onConfirm={confirmCancelSession}
		onCancel={() => {
			showCancelModal = false;
			sessionToCancel = null;
		}}
	/>
{/if}
