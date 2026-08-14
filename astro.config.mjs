// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// Update this once the Cloudflare Pages project exists.
	site: 'https://streamer-scheduler.pages.dev',
	i18n: {
		locales: ['id', 'en'],
		defaultLocale: 'id',
		routing: { prefixDefaultLocale: false },
	},
});
