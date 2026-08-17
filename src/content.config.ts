import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { PLATFORMS, DAYS, TIMEZONES, MAX_BIO_LENGTH } from './lib/constants';

const games = defineCollection({
	loader: glob({ pattern: '**/*.{yaml,yml}', base: './src/data/games' }),
	schema: ({ image }) =>
		z.object({
			name: z.string().min(1),
			/** Short label for the fallback tile when there's no cover art. */
			short: z.string().min(1).max(8),
			/** Extra spellings people search for: "mlbb", "pes", "ptcgp". */
			aliases: z.array(z.string()).default([]),
			/** Drives the fallback tile, so every game looks distinct without art. */
			accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus hex, contoh #1e63d4'),
			/** Drop cover art in src/data/games/covers/ and point at it here. */
			cover: image().optional(),
		}),
});

/** YAML parses a bare `2026-08-20` into a Date, so accept both that and a plain string. */
const isoDate = z.preprocess(
	(v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
	z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD'),
);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam harus format HH:MM (24 jam)');

const channel = z.object({
	platform: z.enum(PLATFORMS),
	handle: z.string().min(1),
	url: z.url().optional(),
	primary: z.boolean().default(false),
});

const recurring = z.object({
	days: z.array(z.enum(DAYS)).min(1, 'Minimal satu hari'),
	start: time,
	duration_min: z.number().int().positive().max(1440).default(120),
	title: z.string().optional(),
	game: z.string().optional(),
	platform: z.enum(PLATFORMS).optional(),
});

const override = z
	.object({
		date: isoDate,
		status: z.enum(['cancelled', 'moved', 'extra']).default('extra'),
		start: time.optional(),
		duration_min: z.number().int().positive().max(1440).default(120),
		title: z.string().optional(),
		game: z.string().optional(),
		platform: z.enum(PLATFORMS).optional(),
		note: z.string().optional(),
	})
	.refine((o) => o.status === 'cancelled' || o.start !== undefined, {
		message: 'Jadwal `moved`/`extra` wajib punya `start`',
		path: ['start'],
	});

const streamers = defineCollection({
	loader: glob({ pattern: '**/*.{yaml,yml}', base: './src/data/streamers' }),
	schema: ({ image }) =>
		z.object({
			name: z.string().min(1),
			/** Other names people search for: old handles, real name, romanised spellings. */
			aliases: z.array(z.string()).default([]),
			bio: z.string().max(MAX_BIO_LENGTH).optional(),
			/**
			 * Profile picture. Saved into src/data/streamers/avatars/ at moderation time
			 * from the URL the streamer submits, so nothing hotlinks to a platform CDN.
			 * Absent is fine: the UI draws an initials tile instead.
			 */
			avatar: image().optional(),
			timezone: z.enum(TIMEZONES).default('Asia/Jakarta'),
			/** Slugs from the games collection. A typo fails the build rather than 404ing. */
			games: z.array(reference('games')).default([]),
			channels: z.array(channel).default([]),
			schedule: z
				.object({
					recurring: z.array(recurring).default([]),
					overrides: z.array(override).default([]),
				})
				.default({ recurring: [], overrides: [] }),
			/** Set by hand after the owner proves control of the channel. */
			verified: z.boolean().default(false),
			/**
			 * HMAC-SHA256 of the hash of the streamer's edit key, under a pepper held
			 * only in Actions secrets. Deliberately not the hash itself: the browser
			 * authenticates by sending that hash, and this repo is public, so storing it
			 * here would publish the credential for anyone to post back. See
			 * `editKeyMac` in scripts/lib/sync-rules.mjs.
			 */
			edit_key_mac: z
				.string()
				.regex(/^[0-9a-f]{64}$/, 'Harus HMAC-SHA256 hex huruf kecil')
				.optional(),
			/** Bumped every time a submission is approved. Drives the staleness badge. */
			updated: isoDate,
		}),
});

export const collections = { streamers, games };
