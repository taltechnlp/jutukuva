<script lang="ts">
	import { _ } from 'svelte-i18n';

	type ConnectionState = 'connected' | 'disconnected' | 'error';

	interface Props {
		state: ConnectionState;
	}

	let { state = 'disconnected' }: Props = $props();

	const statusConfig = $derived({
		connected: {
			color: '#22c55e',
			label: $_('connection.connected'),
			pulse: false
		},
		disconnected: {
			color: '#f97316',
			label: $_('connection.disconnected'),
			pulse: true
		},
		error: {
			color: '#ef4444',
			label: $_('connection.error'),
			pulse: true
		}
	});

	const config = $derived(statusConfig[state]);
</script>

<div class="connection-status" role="status" aria-live="polite" title={config.label}>
	<div class="status-dot" class:pulse={config.pulse} style="background-color: {config.color}"></div>
</div>

<style>
	.connection-status {
		position: fixed;
		top: 2rem;
		right: 2rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: help;
		user-select: none;
	}

	.status-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		transition: background-color 0.3s ease, transform 0.2s ease;
		box-shadow: 0 0 8px currentColor;
		opacity: 0.9;
	}

	.status-dot:hover {
		transform: scale(1.3);
		opacity: 1;
	}

	.status-dot.pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 0.9;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(0.85);
		}
	}

	/* Tooltip-like label on hover */
	.connection-status::after {
		content: attr(title);
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.5rem;
		padding: 0.375rem 0.75rem;
		background: rgba(0, 0, 0, 0.9);
		color: white;
		font-size: 0.75rem;
		border-radius: 0.375rem;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transform: translateY(-4px);
		transition: opacity 0.2s ease, transform 0.2s ease;
	}

	.connection-status:hover::after {
		opacity: 1;
		transform: translateY(0);
	}
</style>
