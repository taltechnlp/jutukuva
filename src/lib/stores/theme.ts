import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme =
	| 'light'
	| 'dark'
	| 'cupcake'
	| 'bumblebee'
	| 'emerald'
	| 'corporate'
	| 'synthwave'
	| 'retro'
	| 'cyberpunk'
	| 'valentine'
	| 'halloween'
	| 'garden'
	| 'forest'
	| 'aqua'
	| 'lofi'
	| 'pastel'
	| 'fantasy'
	| 'wireframe'
	| 'black'
	| 'luxury'
	| 'dracula'
	| 'cmyk'
	| 'autumn'
	| 'business'
	| 'acid'
	| 'lemonade'
	| 'night'
	| 'coffee'
	| 'winter'
	| 'dim'
	| 'nord'
	| 'sunset';

// Get initial theme from localStorage or default to 'light'
function getInitialTheme(): Theme {
	if (browser) {
		const stored = localStorage.getItem('theme');
		if (stored && isValidTheme(stored)) {
			return stored as Theme;
		}
		// Check system preference
		if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
			return 'dark';
		}
	}
	return 'light';
}

function isValidTheme(value: string): boolean {
	const validThemes: Theme[] = [
		'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate',
		'synthwave', 'retro', 'cyberpunk', 'valentine', 'halloween', 'garden',
		'forest', 'aqua', 'lofi', 'pastel', 'fantasy', 'wireframe', 'black',
		'luxury', 'dracula', 'cmyk', 'autumn', 'business', 'acid', 'lemonade',
		'night', 'coffee', 'winter', 'dim', 'nord', 'sunset'
	];
	return validThemes.includes(value as Theme);
}

// Create the theme store
function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>(getInitialTheme());

	return {
		subscribe,
		set: (value: Theme) => {
			if (browser) {
				localStorage.setItem('theme', value);
				document.documentElement.setAttribute('data-theme', value);
			}
			set(value);
		},
		// Initialize theme on mount
		init: () => {
			if (browser) {
				const theme = getInitialTheme();
				document.documentElement.setAttribute('data-theme', theme);
				set(theme);
			}
		}
	};
}

export const theme = createThemeStore();

// Available themes for selection (limited to 10)
export const availableThemes: Theme[] = [
	'light',
	'dark',
	'cupcake',
	'dracula',
	'synthwave',
	'forest',
	'lofi',
	'pastel',
	'cyberpunk',
	'nord'
];

// All available themes
export const allThemes: Theme[] = [
	'light',
	'dark',
	'cupcake',
	'bumblebee',
	'emerald',
	'corporate',
	'synthwave',
	'retro',
	'cyberpunk',
	'valentine',
	'halloween',
	'garden',
	'forest',
	'aqua',
	'lofi',
	'pastel',
	'fantasy',
	'wireframe',
	'black',
	'luxury',
	'dracula',
	'cmyk',
	'autumn',
	'business',
	'acid',
	'lemonade',
	'night',
	'coffee',
	'winter',
	'dim',
	'nord',
	'sunset'
];
