<script lang="ts">
	import '../app.css';
	import '$lib/i18n';
	import { _ } from 'svelte-i18n';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
</script>

<div class="min-h-screen flex flex-col">
	<!-- Navbar -->
	<nav class="navbar bg-base-200 shadow-md">
		<div class="flex-1">
			<a href="/" class="btn btn-ghost text-xl">{$_('app.title')}</a>
		</div>
		<div class="flex-none">
			<LanguageSelector />
		</div>
	</nav>

	<!-- Main content -->
	<main class="flex-1">
		<slot />
	</main>
</div>
