<script lang="ts">
	import { locale } from 'svelte-i18n';
	import { uiLanguages } from '$lib/i18n';

	const languageNames: Record<string, string> = {
		et: 'Eesti',
		en: 'English',
		fi: 'Suomi'
	};

	function changeLanguage(lang: string) {
		locale.set(lang);
		// Optionally persist to localStorage
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('language', lang);
		}
	}

	let currentLocale = $state($locale || 'et');

	// Subscribe to locale changes
	$effect(() => {
		currentLocale = $locale || 'et';
	});
</script>

<div class="dropdown dropdown-end">
	<button tabindex="0" class="btn btn-ghost btn-sm" aria-label="Select language">
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
				d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
			/>
		</svg>
		<span class="hidden sm:inline ml-1">{languageNames[currentLocale]}</span>
	</button>
	<ul
		tabindex="0"
		class="dropdown-content menu bg-base-100 rounded-box z-[1] w-32 p-2 shadow"
	>
		{#each uiLanguages as lang}
			<li>
				<button
					class:active={currentLocale === lang}
					onclick={() => changeLanguage(lang)}
				>
					{languageNames[lang]}
				</button>
			</li>
		{/each}
	</ul>
</div>
