<script lang="ts">
	import { theme, availableThemes, type Theme } from '$lib/stores/theme';
	import { _ } from 'svelte-i18n';

	let currentTheme = $state<Theme>($theme);

	// Subscribe to theme changes
	$effect(() => {
		currentTheme = $theme;
	});

	function changeTheme(newTheme: Theme) {
		theme.set(newTheme);
		// Close dropdown by removing focus
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
	}

	function capitalizeTheme(themeName: string): string {
		return themeName.charAt(0).toUpperCase() + themeName.slice(1);
	}

	// Get icon based on theme
	function getThemeIcon(themeName: Theme): string {
		if (themeName === 'dark' || themeName === 'night' || themeName === 'black' || themeName === 'dracula' || themeName === 'halloween' || themeName === 'forest' || themeName === 'business' || themeName === 'dim' || themeName === 'synthwave' || themeName === 'cyberpunk' || themeName === 'nord') {
			return '🌙'; // Moon for dark themes
		}
		return '☀️'; // Sun for light themes
	}
</script>

<div class="dropdown dropdown-end">
	<button tabindex="0" class="btn btn-ghost btn-sm cursor-pointer" aria-label="Select theme">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
			/>
		</svg>
		<span class="hidden sm:inline ml-1">{$_(`theme.${currentTheme}`, { default: capitalizeTheme(currentTheme) })}</span>
	</button>
	<ul
		tabindex="0"
		class="dropdown-content menu bg-base-100 rounded-box z-[1] w-40 p-2 shadow"
	>
		{#each availableThemes as themeName}
			<li>
				<button
					class:active={currentTheme === themeName}
					onclick={() => changeTheme(themeName)}
					class="flex items-center justify-between cursor-pointer"
				>
					<span>{$_(`theme.${themeName}`, { default: capitalizeTheme(themeName) })}</span>
					<span class="text-xs opacity-70">{getThemeIcon(themeName)}</span>
				</button>
			</li>
		{/each}
	</ul>
</div>
