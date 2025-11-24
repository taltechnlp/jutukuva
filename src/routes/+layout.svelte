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

<div class="min-h-screen flex flex-col">
	<!-- Navbar -->
	<nav class="navbar bg-base-200 shadow-md">
		<div class="flex-1">
			<a href="/" class="btn btn-ghost text-xl">{$_('app.title')}</a>
		</div>
		<div class="flex-none gap-2 flex items-center">
			<ThemeSelector />
			<LanguageSelector />
		</div>
	</nav>

	<!-- Main content -->
	<main class="flex-1">
		<slot />
	</main>
</div>
