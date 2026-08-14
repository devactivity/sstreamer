import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { encodeCsv } from '../lib/csv';

/**
 * Public data dump, generated as a static file at build time.
 *
 * Public columns only. The edit key hashes stay out of this deliberately - anything
 * emitted here is world-readable, and a published hash could be replayed to
 * impersonate a streamer. Use `npm run export` for the full admin backup.
 */
const COLUMNS = [
	'slug',
	'name',
	'aliases',
	'bio',
	'avatar_url',
	'timezone',
	'games',
	'verified',
	'updated',
	'channels',
	'schedule',
] as const;

export const GET: APIRoute = async () => {
	const entries = await getCollection('streamers');
	entries.sort((a, b) => a.id.localeCompare(b.id));

	const rows: string[][] = [
		[...COLUMNS],
		...entries.map((entry) => {
			const d = entry.data;
			return [
				entry.id,
				d.name,
				d.aliases.join('|'),
				d.bio ?? '',
				d.avatar?.src ?? '',
				d.timezone,
				d.games.map((g) => g.id).join('|'),
				String(d.verified),
				d.updated,
				JSON.stringify(d.channels),
				JSON.stringify(d.schedule),
			];
		}),
	];

	return new Response(encodeCsv(rows), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'inline; filename="streamers.csv"',
		},
	});
};
