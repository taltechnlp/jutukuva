<script lang="ts">
	import { onMount } from 'svelte';
	import { locale } from 'svelte-i18n';
	import '../app.css';

	// Set locale from browser on client
	onMount(() => {
		const browserLang = navigator.language.split('-')[0];
		if (['en', 'et', 'fi'].includes(browserLang)) {
			locale.set(browserLang);
		}
	});

	// Props for child routes
	let { children } = $props();
</script>

<svelte:head>
	<title>Jutukuva - Collaborative Speech Editor</title>
	<meta name="description" content="Real-time collaborative speech editor" />
</svelte:head>

<div class="min-h-screen bg-base-100">
	{@render children()}
</div>
