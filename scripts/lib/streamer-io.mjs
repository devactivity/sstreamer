import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
// js-yaml 5 ships named exports only; there is no default export to import.
import { load, dump } from 'js-yaml';

export const STREAMER_DIR = 'src/data/streamers';

/** Column order for the admin round trip. Public exports use a subset of these. */
export const COLUMNS = [
	'slug',
	'name',
	'aliases',
	'bio',
	'avatar',
	'timezone',
	'games',
	'verified',
	'updated',
	'edit_key_hash',
	'channels',
	'schedule',
];

/** Columns safe to publish. The key hash must never appear in a public dump. */
export const PUBLIC_COLUMNS = COLUMNS.filter((c) => c !== 'edit_key_hash');

/**
 * YAML turns bare `2026-08-11` into a Date. Left alone it would JSON.stringify to a
 * full ISO timestamp and break the round trip, so flatten every Date back to a plain
 * date string before anything is serialised.
 */
export function normaliseDates(value) {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (Array.isArray(value)) return value.map(normaliseDates);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseDates(v)]));
	}
	return value;
}

export function listStreamerFiles(dir = STREAMER_DIR) {
	return readdirSync(dir)
		.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
		.sort();
}

export function readStreamers(dir = STREAMER_DIR) {
	return listStreamerFiles(dir).map((file) => ({
		slug: path.basename(file, path.extname(file)),
		file: path.join(dir, file),
		data: normaliseDates(load(readFileSync(path.join(dir, file), 'utf8')) ?? {}),
	}));
}

const DEFAULT_SCHEDULE = { recurring: [], overrides: [] };

/** One streamer as a flat CSV record. */
export function toRecord({ slug, data }) {
	return {
		slug,
		name: data.name ?? '',
		aliases: (data.aliases ?? []).join('|'),
		bio: data.bio ?? '',
		avatar: data.avatar ?? '',
		timezone: data.timezone ?? 'Asia/Jakarta',
		games: (data.games ?? []).join('|'),
		verified: data.verified ? 'true' : 'false',
		updated: data.updated ?? '',
		edit_key_hash: data.edit_key_hash ?? '',
		channels: JSON.stringify(data.channels ?? []),
		schedule: JSON.stringify(data.schedule ?? DEFAULT_SCHEDULE),
	};
}

/**
 * Inverse of toRecord. Keys absent from the record are omitted rather than written
 * as empty, so the schema's own defaults still apply on the way back in.
 */
export function fromRecord(record) {
	const list = (v) =>
		(v ?? '')
			.split('|')
			.map((s) => s.trim())
			.filter(Boolean);

	const json = (v, fallback) => {
		if (!v) return fallback;
		try {
			return JSON.parse(v);
		} catch (err) {
			throw new Error(`invalid JSON in column: ${v.slice(0, 60)} (${err.message})`);
		}
	};

	const data = {
		name: record.name,
		aliases: list(record.aliases),
		timezone: record.timezone || 'Asia/Jakarta',
		games: list(record.games),
		channels: json(record.channels, []),
		schedule: json(record.schedule, structuredClone(DEFAULT_SCHEDULE)),
		verified: record.verified === 'true',
		updated: record.updated,
	};

	if (record.bio) data.bio = record.bio;
	if (record.avatar) data.avatar = record.avatar;
	if (record.edit_key_hash) data.edit_key_hash = record.edit_key_hash;

	return data;
}

export function toYaml(data) {
	return dump(data, { lineWidth: 100, noRefs: true, quotingType: '"' });
}

/** Stable shape for comparing two versions of a streamer. */
export function fingerprint(data) {
	return JSON.stringify(normaliseDates(fromRecord(toRecord({ slug: '', data }))));
}
