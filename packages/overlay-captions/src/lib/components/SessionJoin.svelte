<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { yjsStore } from '$lib/stores/yjs.svelte';
	import { captionStore } from '$lib/stores/caption.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';

	interface Props {
		initialCode?: string;
		initialPassword?: string;
	}

	let { initialCode = '', initialPassword = '' }: Props = $props();

	let sessionCode = $state(initialCode);
	let sessionPassword = $state(initialPassword);
	let inputError = $state('');
	let showPasswordInput = $state(false);

	// Check if password is required based on error
	$effect(() => {
		if (yjsStore.error === 'password_required') {
			showPasswordInput = true;
		}
	});

	// Auto-connect if initial values provided
	$effect(() => {
		if (initialCode && initialCode.length === 6) {
			sessionCode = initialCode;
			if (initialPassword) {
				sessionPassword = initialPassword;
			}
			// Auto-connect after a short delay
			setTimeout(() => connect(), 100);
		}
	});

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

		yjsStore.connect(
			sessionCode,
			settingsStore.settings.connection.yjsServerUrl,
			sessionPassword || undefined
		);
		captionStore.startObserving();
		await settingsStore.setLastSessionCode(sessionCode);
	}

	function disconnect() {
		captionStore.stopObserving();
		captionStore.clear();
		yjsStore.disconnect();
		showPasswordInput = false;
		sessionPassword = '';
	}

	async function quickJoin() {
		if (settingsStore.settings.lastSessionCode) {
			sessionCode = settingsStore.settings.lastSessionCode;
			await connect();
		}
	}

	function handlePasswordSubmit() {
		if (!sessionPassword.trim()) {
			inputError = $_('session.password_required', { default: 'Please enter a password' });
			return;
		}
		inputError = '';
		connect();
	}
</script>

<div class="flex flex-col items-center gap-6 w-full transition-all duration-300">
	{#if yjsStore.connected}
		<div class="flex items-center justify-between w-full p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
			<div class="flex flex-col gap-1">
				<span class="text-xs font-medium text-white/50 uppercase tracking-wider">{$_('session.title')}</span>
				<div class="flex items-center gap-2">
					<span class="relative flex h-2.5 w-2.5">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
						<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
					</span>
					<span class="font-mono text-lg font-bold tracking-widest text-white">{yjsStore.sessionCode}</span>
				</div>
			</div>
			<button 
				onclick={disconnect} 
				class="btn btn-ghost btn-sm text-white/60 hover:text-white hover:bg-white/10"
				aria-label={$_('session.disconnect')}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clip-rule="evenodd" />
				</svg>
			</button>
		</div>
	{:else}
		<div class="w-full space-y-4">
			<div class="text-center space-y-1 mb-6">
				<h2 class="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
					{$_('session.title')}
				</h2>
				<p class="text-sm text-white/40">{$_('session.code_placeholder')}</p>
			</div>

			<div class="relative group">
				<input
					type="text"
					value={sessionCode}
					oninput={handleInput}
					placeholder="000000"
					class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-center font-mono text-3xl font-bold tracking-[0.5em] text-white placeholder-white/10 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all uppercase"
					class:border-error={inputError && !showPasswordInput}
					maxlength="6"
				/>
			</div>

			<!-- Password Input (shown when required) -->
			{#if showPasswordInput}
				<div class="relative group">
					<input
						type="password"
						bind:value={sessionPassword}
						placeholder={$_('session.password_placeholder', { default: 'Enter password' })}
						class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-white placeholder-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
						class:border-error={inputError}
					/>
					<p class="text-xs text-white/50 text-center mt-2">
						{$_('session.password_hint', { default: 'This session requires a password' })}
					</p>
				</div>
			{/if}

			{#if inputError}
				<p class="text-center text-error text-xs font-medium animate-shake">
					{inputError}
				</p>
			{/if}

			<button
				onclick={showPasswordInput ? handlePasswordSubmit : connect}
				disabled={yjsStore.connecting || sessionCode.length !== 6}
				class="btn btn-primary btn-lg w-full rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300 disabled:bg-white/5 disabled:text-white/20 font-bold"
			>
				{#if yjsStore.connecting}
					<span class="loading loading-spinner loading-md"></span>
				{:else}
					{$_('session.connect')}
				{/if}
			</button>

			{#if settingsStore.settings.lastSessionCode && sessionCode !== settingsStore.settings.lastSessionCode}
				<button 
					onclick={quickJoin} 
					class="btn btn-ghost btn-sm w-full text-white/40 hover:text-white/80 normal-case font-normal"
				>
					{$_('session.rejoin')} <span class="font-mono ml-1">{settingsStore.settings.lastSessionCode}</span>
				</button>
			{/if}
			
			{#if yjsStore.error && yjsStore.error !== 'password_required'}
				<div class="alert alert-error text-xs py-2 mt-4 rounded-lg bg-error/10 text-error border-error/20">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{yjsStore.error}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Add a subtle animation for validation errors */
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-4px); }
		75% { transform: translateX(4px); }
	}
	.animate-shake {
		animation: shake 0.3s ease-in-out;
	}
</style>
