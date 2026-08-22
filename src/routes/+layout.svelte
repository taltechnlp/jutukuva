<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import '$lib/i18n';
	import { _, locale } from 'svelte-i18n';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import ThemeSelector from '$lib/components/ThemeSelector.svelte';
	import { theme, type Theme } from '$lib/stores/theme';
	import type { Snippet } from 'svelte';

	const themeOptions: Theme[] = ['light', 'dark'];
	const languageOptions = ['et', 'en', 'fi'] as const;

	let { children }: { children: Snippet } = $props();
	import { modalStore } from '$lib/stores/modalStore.svelte';
	import { clickOutside } from '$lib/components/prosemirror-speech/utils/clickOutside';

	let isMacOS = $state(false);
	let settingsOpen = $state(false);
	let mobileMenuOpen = $state(false);

	// Initialize theme and language on mount
	onMount(() => {
		theme.init();

		// Load saved language preference
		const savedLang = localStorage.getItem('language');
		if (savedLang && ['et', 'en', 'fi'].includes(savedLang)) {
			locale.set(savedLang);
		}

		// Detect macOS for traffic light padding
		if (typeof window !== 'undefined' && window.electronAPI?.getPlatform) {
			window.electronAPI.getPlatform().then((platform: string) => {
				isMacOS = platform === 'darwin';
			});
		}
	});

	// Navigation items - now using action handlers instead of hrefs for modals
	type NavItem = {
		id: string;
		labelKey: string;
		labelDefault: string;
		action?: () => void;
	};

	const navItems: NavItem[] = [
		{
			id: 'editor',
			labelKey: 'app.title',
			labelDefault: 'Speech Recognition'
		},
		{
			id: 'sessions',
			labelKey: 'nav.sessions',
			labelDefault: 'Sessions',
			action: () => modalStore.openSessions()
		},
		{
			id: 'dictionaries',
			labelKey: 'nav.textSnippets',
			labelDefault: 'Substitutions',
			action: () => modalStore.openDictionaries()
		},
		{
			id: 'help',
			labelKey: 'nav.help',
			labelDefault: 'Kasutusjuhend',
			action: () => modalStore.openHelp()
		}
	];

	// Determine which nav item is "active" based on modal state
	function isNavActive(id: string): boolean {
		if (id === 'sessions') return modalStore.showSessionsModal;
		if (id === 'dictionaries') return modalStore.showDictionariesModal;
		if (id === 'help') return modalStore.showHelpModal;
		// Editor is active when no modal is open
		return id === 'editor' && !modalStore.showSessionsModal && !modalStore.showDictionariesModal && !modalStore.showHelpModal;
	}

	function handleNavClick(item: NavItem) {
		// Close any open modal first if clicking editor
		if (item.id === 'editor') {
			modalStore.closeSessions();
			modalStore.closeDictionaries();
			modalStore.closeHelp();
		} else if (item.action) {
			// Close other modals before opening this one
			if (item.id === 'sessions') {
				modalStore.closeDictionaries();
				modalStore.closeHelp();
			} else if (item.id === 'dictionaries') {
				modalStore.closeSessions();
				modalStore.closeHelp();
			} else if (item.id === 'help') {
				modalStore.closeSessions();
				modalStore.closeDictionaries();
			}
			item.action();
		}
	}
</script>

<div class="min-h-screen flex flex-col bg-base-100 font-sans selection:bg-primary/20">
	<!-- Navbar -->
	<nav class="w-full bg-base-100 border-b border-base-200/50 transition-all duration-300 overflow-visible">
		<!-- macOS traffic light spacer -->
		{#if isMacOS}
		<div class="h-9.5 md:h-9.5"></div>
		{/if}
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-visible">
			<div class="flex items-center justify-between h-14 md:h-16 overflow-visible">

				<!-- Left: Logo -->
				<div class="shrink-0 flex items-center md:w-50">
					<a href="/" class="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
						Jutukuva
					</a>
				</div>

				<!-- Mobile: Navigation menu button -->
				<div class="relative md:hidden">
					<button
						type="button"
						class="flex items-center justify-center w-10 h-10 rounded-full hover:bg-base-200/50 transition-colors"
						aria-label="Menu"
						onclick={() => mobileMenuOpen = !mobileMenuOpen}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
						</svg>
					</button>
					{#if mobileMenuOpen}
					<ul class="absolute right-0 top-full mt-2 menu p-3 shadow-xl bg-base-100 rounded-box w-56 border border-base-300 z-1000" use:clickOutside={() => mobileMenuOpen = false}>
						{#each navItems as item}
							{@const isActive = isNavActive(item.id)}
							<li>
								<button
									class="cursor-pointer"
									class:active={isActive}
									onclick={() => { handleNavClick(item); mobileMenuOpen = false; }}
								>
									{$_(item.labelKey, { default: item.labelDefault })}
								</button>
							</li>
						{/each}
						<div class="divider my-1"></div>
						<li class="menu-title">{$_('settings.theme', { default: 'Theme' })}</li>
						{#each themeOptions as themeName}
							<li>
								<button
									class="cursor-pointer"
									class:active={$theme === themeName}
									onclick={() => { theme.set(themeName); mobileMenuOpen = false; }}
								>
									{themeName === 'light' ? '☀️' : '🌙'} {$_(`theme.${themeName}`, { default: themeName })}
								</button>
							</li>
						{/each}
						<div class="divider my-1"></div>
						<li class="menu-title">{$_('settings.language', { default: 'Language' })}</li>
						{#each languageOptions as lang}
							<li>
								<button
									class="cursor-pointer"
									class:active={$locale === lang}
									onclick={() => { locale.set(lang); localStorage.setItem('language', lang); mobileMenuOpen = false; }}
								>
									{lang === 'et' ? 'Eesti' : lang === 'en' ? 'English' : 'Suomi'}
								</button>
							</li>
						{/each}
					</ul>
					{/if}
				</div>

				<!-- Center: Navigation (tablet/desktop) -->
				<div class="hidden md:flex flex-1 justify-center">
					<div class="flex items-center space-x-1 bg-base-200/50 p-1.5 rounded-full backdrop-blur-sm">
						{#each navItems as item}
							{@const isActive = isNavActive(item.id)}
							<button
								onclick={() => handleNavClick(item)}
								class="relative px-5 py-2.5 text-sm font-medium rounded-full transition-all duration-200 ease-out
								{isActive
									? 'bg-white text-primary shadow-sm ring-1 ring-black/5 dark:bg-base-100 dark:text-primary dark:ring-white/10'
									: 'text-base-content/60 hover:text-base-content hover:bg-base-200/50'}"
							>
								{$_(item.labelKey, { default: item.labelDefault })}
							</button>
						{/each}
					</div>
				</div>

				<!-- Right: Settings (hidden on mobile, shown in bottom bar instead) -->
				<div class="hidden md:flex items-center justify-end space-x-2 overflow-visible">
					<!-- Desktop (lg+): inline settings -->
					<div class="hidden lg:flex items-center bg-base-200/30 rounded-full px-2 py-1 overflow-visible">
						<ThemeSelector />
						<div class="w-px h-4 bg-base-content/10 mx-1"></div>
						<LanguageSelector />
					</div>

					<!-- Tablet (md to lg): settings dropdown -->
					<div class="relative lg:hidden">
						<button
							type="button"
							class="flex items-center justify-center w-10 h-10 rounded-full bg-base-200/30 hover:bg-base-200/50 transition-colors"
							aria-label="Settings"
							onclick={() => settingsOpen = !settingsOpen}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="3"></circle>
								<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
							</svg>
						</button>
						{#if settingsOpen}
						<ul class="absolute right-0 top-full menu p-3 shadow-xl bg-base-100 rounded-box w-52 border border-base-300 mt-2" use:clickOutside={() => settingsOpen = false}>
							<li class="menu-title">{$_('settings.theme', { default: 'Theme' })}</li>
							{#each themeOptions as themeName}
								<li>
									<button
										class="cursor-pointer"
										class:active={$theme === themeName}
										onclick={() => { theme.set(themeName); settingsOpen = false; }}
									>
										{themeName === 'light' ? '☀️' : '🌙'} {$_(`theme.${themeName}`, { default: themeName })}
									</button>
								</li>
							{/each}
							<div class="divider my-1"></div>
							<li class="menu-title">{$_('settings.language', { default: 'Language' })}</li>
							{#each languageOptions as lang}
								<li>
									<button
										class="cursor-pointer"
										class:active={$locale === lang}
										onclick={() => { locale.set(lang); localStorage.setItem('language', lang); settingsOpen = false; }}
									>
										{lang === 'et' ? 'Eesti' : lang === 'en' ? 'English' : 'Suomi'}
									</button>
								</li>
							{/each}
						</ul>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Mobile menu (Bottom Bar) -->
		<div class="md:hidden fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-200 pb-safe z-1000 px-4 py-3">
			<div class="flex justify-between items-center h-12">
				{#each navItems as item}
					{@const isActive = isNavActive(item.id)}
					<button
						onclick={() => handleNavClick(item)}
						class="flex flex-col items-center justify-center flex-1 h-full space-y-1 rounded-xl transition-colors
						{isActive ? 'text-primary bg-primary/5' : 'text-base-content/50 hover:text-base-content'}"
					>
						<span class="text-xs font-medium">{$_(item.labelKey, { default: item.labelDefault })}</span>
						{#if isActive}
							<span class="w-1 h-1 rounded-full bg-primary"></span>
						{/if}
					</button>
				{/each}

				<!-- Settings button with dropdown inside bottom bar -->
				<div class="relative shrink-0 ml-2">
					<button
						type="button"
						class="flex flex-col items-center justify-center w-12 h-full space-y-1 rounded-xl transition-colors text-base-content/50 hover:text-base-content"
						aria-label="Settings"
						onclick={() => settingsOpen = !settingsOpen}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="3"></circle>
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
						</svg>
					</button>
					{#if settingsOpen}
					<ul class="absolute right-0 bottom-full mb-2 menu p-3 shadow-xl bg-base-100 rounded-box w-52 border border-base-300" use:clickOutside={() => settingsOpen = false}>
						<li class="menu-title">{$_('settings.theme', { default: 'Theme' })}</li>
						{#each themeOptions as themeName}
							<li>
								<button
									class="cursor-pointer"
									class:active={$theme === themeName}
									onclick={() => { theme.set(themeName); settingsOpen = false; }}
								>
									{themeName === 'light' ? '☀️' : '🌙'} {$_(`theme.${themeName}`, { default: themeName })}
								</button>
							</li>
						{/each}
						<div class="divider my-1"></div>
						<li class="menu-title">{$_('settings.language', { default: 'Language' })}</li>
						{#each languageOptions as lang}
							<li>
								<button
									class="cursor-pointer"
									class:active={$locale === lang}
									onclick={() => { locale.set(lang); localStorage.setItem('language', lang); settingsOpen = false; }}
								>
									{lang === 'et' ? 'Eesti' : lang === 'en' ? 'English' : 'Suomi'}
								</button>
							</li>
						{/each}
					</ul>
					{/if}
				</div>
			</div>
		</div>
	</nav>

	<!-- Main content -->
	<main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 mb-6 animate-in fade-in duration-500">
		{@render children()}
	</main>
</div>

<style>
	/* Safe area padding for mobile bottom nav */
	.pb-safe {
		padding-bottom: env(safe-area-inset-bottom);
	}
</style>
