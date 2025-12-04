import { addMessages, init } from 'svelte-i18n';
import et from './et.json';

addMessages('et', et);

init({
	fallbackLocale: 'et',
	initialLocale: 'et'
});
