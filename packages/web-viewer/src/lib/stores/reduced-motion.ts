import { readable } from 'svelte/store';
import { browser } from '$app/environment';

export const prefersReducedMotion = readable(false, (set) => {
	if (!browser) {
		return;
	}

	const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	set(mediaQuery.matches);

	const handler = (event: MediaQueryListEvent) => set(event.matches);
	mediaQuery.addEventListener('change', handler);

	return () => mediaQuery.removeEventListener('change', handler);
});
