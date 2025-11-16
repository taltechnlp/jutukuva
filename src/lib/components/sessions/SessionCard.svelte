<script lang="ts">
	interface Props {
		session: TranscriptionSession;
		onActivate: () => void;
		onComplete: () => void;
		onCancel: () => void;
		onEdit: () => void;
	}

	let { session, onActivate, onComplete, onCancel, onEdit }: Props = $props();

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

	function formatDuration(seconds: number): string {
		if (!seconds) return '0min';
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours > 0) {
			return `${hours}h ${minutes}min`;
		}
		return `${minutes}min`;
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'planned':
				return 'badge-info';
			case 'active':
				return 'badge-success';
			case 'completed':
				return 'badge-primary';
			case 'cancelled':
				return 'badge-error';
			default:
				return 'badge-ghost';
		}
	}

	function getStatusText(status: string): string {
		return status.charAt(0).toUpperCase() + status.slice(1);
	}

	function isUpcoming(): boolean {
		if (!session.scheduled_date) return false;
		return new Date(session.scheduled_date) > new Date() && session.status === 'planned';
	}

	function isPastDue(): boolean {
		if (!session.scheduled_date) return false;
		return new Date(session.scheduled_date) < new Date() && session.status === 'planned';
	}
</script>

<div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
	<div class="card-body">
		<!-- Header -->
		<div class="flex justify-between items-start mb-2">
			<h2 class="card-title text-lg">
				{session.name}
			</h2>
			<div class={`badge ${getStatusColor(session.status)}`}>
				{getStatusText(session.status)}
			</div>
		</div>

		<!-- Session Info -->
		<div class="space-y-2 text-sm">
			{#if session.scheduled_date}
				<div class="flex items-center gap-2 text-base-content/70">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					<span class={isPastDue() ? 'text-error' : ''}>
						{formatDate(session.scheduled_date)}
						{#if isPastDue()}
							<span class="badge badge-error badge-xs ml-1">Past Due</span>
						{:else if isUpcoming()}
							<span class="badge badge-info badge-xs ml-1">Upcoming</span>
						{/if}
					</span>
				</div>
			{/if}

			{#if session.session_code}
				<div class="flex items-center gap-2 text-base-content/70">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
					</svg>
					<span class="font-mono">{session.session_code}</span>
				</div>
			{/if}

			{#if session.duration_seconds > 0}
				<div class="flex items-center gap-2 text-base-content/70">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{formatDuration(session.duration_seconds)}</span>
				</div>
			{/if}

			{#if session.word_count > 0}
				<div class="flex items-center gap-2 text-base-content/70">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					<span>{session.word_count.toLocaleString()} words</span>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="card-actions justify-end mt-4">
			{#if session.status === 'planned'}
				<button
					class="btn btn-sm btn-primary"
					onclick={onActivate}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					Activate
				</button>
				<button
					class="btn btn-sm btn-ghost"
					onclick={onCancel}
				>
					Cancel
				</button>
			{:else if session.status === 'active'}
				<button
					class="btn btn-sm btn-success"
					onclick={onComplete}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					Complete
				</button>
				<button
					class="btn btn-sm btn-primary"
					onclick={onActivate}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
					</svg>
					Open
				</button>
			{:else if session.status === 'completed'}
				<button
					class="btn btn-sm btn-ghost"
					onclick={onActivate}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
					</svg>
					View
				</button>
			{:else if session.status === 'cancelled'}
				<div class="text-xs text-base-content/50">
					Cancelled {session.cancelled_at ? formatDate(session.cancelled_at) : ''}
				</div>
			{/if}
		</div>
	</div>
</div>
