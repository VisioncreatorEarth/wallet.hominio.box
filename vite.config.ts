import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		nodePolyfills({
			// Options to polyfill specific globals and modules.
			// Whether to polyfill `global`.
			globals: {
				global: true, // Polyfill the `global` object
				Buffer: true, // Polyfill the `Buffer` object
				process: true, // Polyfill `process` if needed by other dependencies
			},
			// Whether to polyfill `node:` protocol imports.
			protocolImports: true,
		}),
	]
});
