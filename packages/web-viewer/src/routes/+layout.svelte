<script lang="ts">
	import { onMount } from 'svelte';
	import { init, locale, register } from 'svelte-i18n';

	// Import shared i18n dictionaries
	import enDict from '$shared/i18n/en.json';
	import etDict from '$shared/i18n/et.json';
	import fiDict from '$shared/i18n/fi.json';

	// Register locales
	register('en', () => Promise.resolve(enDict));
	register('et', () => Promise.resolve(etDict));
	register('fi', () => Promise.resolve(fiDict));

	// Initialize with Estonian as default
	init({
		fallbackLocale: 'en',
		initialLocale: 'et'
	});

	// Set locale from browser
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
	<title>Kirikaja - Collaborative Speech Editor</title>
	<meta name="description" content="Real-time collaborative speech editor" />
</svelte:head>

<div class="min-h-screen bg-base-100">
	{@render children()}
</div>
