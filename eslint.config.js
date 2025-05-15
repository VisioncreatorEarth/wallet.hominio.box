// eslint.config.js (root)
import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sveltePlugin from 'eslint-plugin-svelte';
import prettierConfig from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import { fileURLToPath } from 'node:url';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default tseslint.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['packages/wallet/**/*.svelte'],
		plugins: { svelte: sveltePlugin }, // New flat config plugins syntax
		processor: sveltePlugin.processor, // Keep if sveltePlugin.processor is needed, often it is for script tags
		languageOptions: {
			parser: sveltePlugin.parser, // Or specific parser like 'svelte-eslint-parser'
			parserOptions: {
				projectService: {
					project: './packages/wallet/tsconfig.json'
				},
				parser: tseslint.parser,
				extraFileExtensions: ['.svelte']
				// svelteConfig can be automatically discovered if svelte.config.js is in the Svelte project root (packages/wallet)
			},
			globals: {
				...globals.browser,
				// 'svelte/compiler': 'readonly', // Only if you directly import from svelte/compiler
				// Add Svelte 5 specific globals if linting issues arise for runes
				$state: 'readonly',
				$derived: 'readonly',
				$effect: 'readonly',
				$props: 'readonly',
				$inspect: 'readonly',
				$host: 'readonly'
			}
		},
		rules: {
			// Base Svelte rules (often from sveltePlugin.configs.recommended.rules)
			// For flat config, you might need to spread them or pick them.
			// Example: ...sveltePlugin.configs.recommended.rules (if that object exists and is flat-config compatible)
			// Or manually add them e.g.:
			'svelte/comment-directive': 'error',
			'svelte/no-at-debug-tags': 'warn',
			'svelte/no-at-html-tags': 'error'
			// Add/override Svelte specific rules here
		}
	},
	prettierConfig, // Must be last to override other configs that might affect formatting
	{
		// Global language options and rules, apply to all files not overridden above
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// Add any global overrides here
			// 'no-undef': 'off' // Example, if needed due to Svelte5 reactivity - Svelte plugin should handle this for Svelte files
		}
	}
);
