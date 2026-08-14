// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// Canonical and hreflang URLs are generated from this, so it must match the
	// deployed domain exactly.
	site: 'https://sstreamer.pages.dev',
	i18n: {
		locales: ['id', 'en'],
		defaultLocale: 'id',
		routing: { prefixDefaultLocale: false },
	},
});
