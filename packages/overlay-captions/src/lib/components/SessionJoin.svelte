<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { yjsStore } from '$lib/stores/yjs.svelte';
	import { captionStore } from '$lib/stores/caption.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';

	let sessionCode = $state('');
	let inputError = $state('');

	function validateCode(code: string): boolean {
		return /^[A-Z0-9]{6}$/.test(code);
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		sessionCode = target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
		inputError = '';
	}

	async function connect() {
		if (!validateCode(sessionCode)) {
			inputError = $_('session.error_invalid_code');
			return;
		}

		yjsStore.connect(sessionCode, settingsStore.settings.connection.yjsServerUrl);
		captionStore.startObserving();
		await settingsStore.setLastSessionCode(sessionCode);
	}

	function disconnect() {
		captionStore.stopObserving();
		captionStore.clear();
		yjsStore.disconnect();
	}

	async function quickJoin() {
		if (settingsStore.settings.lastSessionCode) {
			sessionCode = settingsStore.settings.lastSessionCode;
			await connect();
		}
	}
</script>

<div class="card bg-base-200 shadow-lg">
	<div class="card-body p-4">
		<h2 class="card-title text-sm">{$_('session.title')}</h2>

		{#if yjsStore.connected}
			<div class="flex items-center gap-2">
				<div class="badge badge-success gap-1">
					<span class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
					{$_('session.connected')}: {yjsStore.sessionCode}
				</div>
				<button onclick={disconnect} class="btn btn-sm btn-ghost text-error">{$_('session.disconnect')}</button>
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				<div class="join w-full">
					<input
						type="text"
						value={sessionCode}
						oninput={handleInput}
						placeholder={$_('session.code_placeholder')}
						class="input input-bordered join-item flex-1 font-mono text-center tracking-widest uppercase"
						class:input-error={inputError}
						maxlength="6"
					/>
					<button
						onclick={connect}
						disabled={yjsStore.connecting || sessionCode.length !== 6}
						class="btn btn-primary join-item"
					>
						{#if yjsStore.connecting}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							{$_('session.connect')}
						{/if}
					</button>
				</div>

				{#if inputError}
					<p class="text-error text-xs">{inputError}</p>
				{/if}

				{#if yjsStore.error}
					<p class="text-error text-xs">{yjsStore.error}</p>
				{/if}

				{#if settingsStore.settings.lastSessionCode && sessionCode !== settingsStore.settings.lastSessionCode}
					<button onclick={quickJoin} class="btn btn-sm btn-ghost">
						{$_('session.rejoin')}: {settingsStore.settings.lastSessionCode}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
