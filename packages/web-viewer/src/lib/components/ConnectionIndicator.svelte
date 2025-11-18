<script lang="ts">
	export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'disconnected';

	interface Props {
		state: ConnectionState;
	}

	let { state }: Props = $props();

	const stateLabels: Record<ConnectionState, string> = {
		connected: 'Connected',
		connecting: 'Connecting…',
		reconnecting: 'Reconnecting…',
		error: 'Error — disconnected',
		disconnected: 'Disconnected'
	};
</script>

<div class="connection-indicator">
	<span class="connection-dot {state}" aria-hidden="true"></span>
	<span class="sr-only">{stateLabels[state]}</span>
</div>
