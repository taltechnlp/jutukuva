<script lang="ts">
	import '$lib/i18n';
	import { _ } from 'svelte-i18n';
	import '../app.css';

	// Props for child routes
	let { children } = $props();
</script>

<svelte:head>
	<title>{$_('app.title')}</title>
	<meta name="description" content={$_('app.description')} />
</svelte:head>

{@render children()}
