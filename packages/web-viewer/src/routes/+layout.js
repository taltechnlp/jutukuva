import { init, register, waitLocale } from 'svelte-i18n';

// Import shared i18n dictionaries
import enDict from '$shared/i18n/en.json';
import etDict from '$shared/i18n/et.json';
import fiDict from '$shared/i18n/fi.json';

// Register locales
register('en', () => Promise.resolve(enDict));
register('et', () => Promise.resolve(etDict));
register('fi', () => Promise.resolve(fiDict));

// Initialize i18n
init({
	fallbackLocale: 'en',
	initialLocale: 'et'
});

export const load = async () => {
	// Wait for locale to be loaded during SSR
	await waitLocale();
	return {};
};
