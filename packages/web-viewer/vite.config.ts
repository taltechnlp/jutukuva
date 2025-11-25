import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, '../../src/lib'),
			$shared: path.resolve(__dirname, '../../src/lib')
		}
	},
	server: {
		fs: {
			// Allow serving files from the parent directory (for shared components)
			allow: ['..', '../..']
		}
	}
});
