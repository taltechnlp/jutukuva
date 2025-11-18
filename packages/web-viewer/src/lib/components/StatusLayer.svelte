<script lang="ts">
	import type { ConnectionState } from './ConnectionIndicator.svelte';

	interface Props {
		state: ConnectionState;
		onReconnect: () => void;
		errorMessage?: string | null;
		variant?: 'local' | 'global';
	}

	let { state, onReconnect, errorMessage = null, variant = 'local' }: Props = $props();

	const messages: Partial<Record<ConnectionState, string>> = {
		connecting: 'Connecting to live captions…',
		reconnecting: 'Reconnecting…',
		disconnected: 'Connection lost',
		error: 'Stream unavailable'
	};

	const isProgressState = $derived(state === 'connecting' || state === 'reconnecting');
	const label = $derived(errorMessage ?? messages[state] ?? 'Working…');
</script>

{#if state !== 'connected'}
	<div
		class="status-overlay {variant === 'global' ? 'global' : ''}"
		role="alert"
		aria-live="assertive"
	>
		<div class="status-message">
			{#if isProgressState}
				<div class="spinner" aria-hidden="true"></div>
			{/if}
			<p>{label}</p>
			{#if !isProgressState}
				<button type="button" class="preset-chip" onclick={onReconnect}> Reconnect </button>
			{/if}
		</div>
	</div>
{/if}
