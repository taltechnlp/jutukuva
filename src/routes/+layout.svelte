<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import '$lib/i18n';
	import { theme } from '$lib/stores/theme';

	// Initialize theme on mount
	onMount(() => {
		theme.init();
	});
</script>

<div class="min-h-screen flex flex-col bg-base-100 font-sans selection:bg-primary/20">
	<slot />
</div>
