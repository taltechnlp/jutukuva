<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import '$lib/i18n';
	import { _ } from 'svelte-i18n';
	import { page } from '$app/stores';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import ThemeSelector from '$lib/components/ThemeSelector.svelte';
	import { theme } from '$lib/stores/theme';

	// Initialize theme on mount
	onMount(() => {
		theme.init();
	});

	// Navigation items
	const navItems = [
		{
			href: '/',
			labelKey: 'app.title',
			labelDefault: 'Speech Recognition',
			exact: true
		},
		{
			href: '/sessions',
			labelKey: 'nav.sessions',
			labelDefault: 'Sessions',
			exact: false
		},
		{
			href: '/settings/dictionaries',
			labelKey: 'nav.textSnippets',
			labelDefault: 'Text Snippets',
			exact: false
		}
	];
</script>

<div class="min-h-screen flex flex-col bg-base-100 font-sans selection:bg-primary/20">
	<!-- Navbar -->
	<nav class="sticky top-0 z-50 w-full bg-base-100/80 backdrop-blur-xl border-b border-base-200/50 transition-all duration-300">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between h-16">
				
				<!-- Left: Logo -->
				<div class="flex-shrink-0 flex items-center w-[200px]">
					<a href="/" class="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
						{$_('app.title', { default: 'Jutukuva' })}
					</a>
				</div>

				<!-- Center: Navigation -->
				<div class="hidden md:flex flex-1 justify-center">
					<div class="flex items-center space-x-1 bg-base-200/50 p-1.5 rounded-full backdrop-blur-sm">
						{#each navItems as item}
							{@const isActive = item.exact 
								? $page.url.pathname === item.href 
								: (item.href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(item.href))}
							<a
								href={item.href}
								class="relative px-5 py-2.5 text-sm font-medium rounded-full transition-all duration-200 ease-out
								{isActive
									? 'bg-white text-primary shadow-sm ring-1 ring-black/5 dark:bg-base-100 dark:text-primary dark:ring-white/10'
									: 'text-base-content/60 hover:text-base-content hover:bg-base-200/50'}"
							>
								{$_(item.labelKey, { default: item.labelDefault })}
							</a>
						{/each}
					</div>
				</div>

				<!-- Right: Settings -->
				<div class="flex items-center justify-end space-x-2">
					<div class="flex items-center bg-base-200/30 rounded-full px-2 py-1">
						<ThemeSelector />
						<div class="w-px h-4 bg-base-content/10 mx-1"></div>
						<LanguageSelector />
					</div>
				</div>
			</div>
		</div>

		<!-- Mobile menu (Bottom Bar) -->
		<div class="md:hidden fixed bottom-0 left-0 right-0 bg-base-100/90 backdrop-blur-xl border-t border-base-200 pb-safe z-50 px-6 py-3">
			<div class="flex justify-between items-center h-12">
				{#each navItems as item}
					{@const isActive = item.exact 
						? $page.url.pathname === item.href 
						: (item.href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(item.href))}
					<a
						href={item.href}
						class="flex flex-col items-center justify-center w-full h-full space-y-1 rounded-xl transition-colors
						{isActive ? 'text-primary bg-primary/5' : 'text-base-content/50 hover:text-base-content'}"
					>
						<span class="text-xs font-medium">{$_(item.labelKey, { default: item.labelDefault })}</span>
						{#if isActive}
							<span class="w-1 h-1 rounded-full bg-primary"></span>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	</nav>

	<!-- Main content -->
	<main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 mb-6 animate-in fade-in duration-500">
		<slot />
	</main>
</div>

<style>
	/* Safe area padding for mobile bottom nav */
	.pb-safe {
		padding-bottom: env(safe-area-inset-bottom);
	}
</style>
