<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import '$lib/i18n';
	import { _ } from 'svelte-i18n';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import ThemeSelector from '$lib/components/ThemeSelector.svelte';
	import { theme } from '$lib/stores/theme';

	// Initialize theme on mount
	onMount(() => {
		theme.init();
	});
</script>

<div class="min-h-screen flex flex-col bg-base-100">
	<!-- Navbar -->
	<nav class="navbar bg-base-200 shadow-md border-b border-base-300">
		<div class="flex-1">
			<a href="/" class="btn btn-ghost text-xl normal-case">{$_('app.title')}</a>
		</div>
		<div class="flex-none gap-2 flex items-center">
			<a href="/sessions" class="btn btn-ghost btn-sm">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
				</svg>
				<span class="hidden md:inline">{$_('nav.sessions', { default: 'Sessions' })}</span>
			</a>
			<a href="/settings/dictionaries" class="btn btn-ghost btn-sm" title={$_('nav.textSnippets', { default: 'Text Snippets' })}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				<span class="hidden md:inline">{$_('nav.textSnippets', { default: 'Text Snippets' })}</span>
			</a>
			<ThemeSelector />
			<LanguageSelector />
		</div>
	</nav>

	<!-- Main content -->
	<main class="flex-1 bg-base-200">
		<slot />
	</main>
</div>
