import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	toFormEntries,
	isSubmitConfigured,
	FORM_ACTION,
	FIELD_IDS,
	type SubmitField,
} from '../src/lib/submit.ts';
import { slugify } from '../src/lib/text.ts';

const ids: Record<SubmitField, string> = {
	slug: 'entry.1',
	name: 'entry.2',
	aliases: '',
	bio: 'entry.3',
	timezone: '',
	games: '',
	platform: 'entry.4',
	handle: '',
	channels: '',
	game: '',
	days: '',
	start: '',
	duration_min: '',
	title: '',
	streams: '',
	avatar_url: '',
	edit_key_hash: 'entry.9',
};

describe('isSubmitConfigured', () => {
	// Guards the real config: if someone blanks FORM_ACTION or a required id, the
	// forms silently fall back to preview mode and stop submitting.
	it('the shipped config is complete', () =>
		assert.equal(isSubmitConfigured(FORM_ACTION, FIELD_IDS), true));

	/**
	 * Fields whose form question does not exist yet. Blank ids are dropped by
	 * toFormEntries, so these send nothing rather than sending wrongly. Remove a field
	 * from here the moment its id is filled in, or the guard below stops covering it.
	 *
	 * Empty is the healthy state: every field is wired, so the guard below covers all
	 * of them. Only add to this while a question is genuinely still missing.
	 */
	const AWAITING_QUESTION = new Set<string>();

	// An id that is present but malformed is dropped by Google without an error, and
	// the response is opaque to us, so the field would silently stop submitting.
	it('every wired field has an id, so no column is silently unreachable', () => {
		for (const [field, id] of Object.entries(FIELD_IDS)) {
			if (AWAITING_QUESTION.has(field)) continue;
			assert.match(id, /^entry\.\d+$/, `${field} has a malformed id: ${id}`);
		}
	});

	it('fields awaiting a question are blank, not half-filled', () => {
		for (const field of AWAITING_QUESTION) {
			assert.equal(
				FIELD_IDS[field as keyof typeof FIELD_IDS],
				'',
				`${field} has an id now - remove it from AWAITING_QUESTION`,
			);
		}
	});

	it('no two fields share an id', () => {
		const ids = Object.values(FIELD_IDS).filter(Boolean);
		assert.equal(new Set(ids).size, ids.length);
	});

	it('the action points at formResponse, not viewform', () =>
		assert.match(FORM_ACTION, /\/formResponse$/));

	it('is false with an empty action', () => assert.equal(isSubmitConfigured('', FIELD_IDS), false));

	it('is false with an action but no field ids', () => {
		const blank = Object.fromEntries(
			Object.keys(FIELD_IDS).map((k) => [k, '']),
		) as Record<SubmitField, string>;
		assert.equal(isSubmitConfigured('https://example.com/formResponse', blank), false);
	});

	it('is false with field ids but no action', () =>
		assert.equal(isSubmitConfigured('', ids), false));

	it('is false when a required field id is missing', () =>
		assert.equal(
			isSubmitConfigured('https://example.com/formResponse', { ...ids, edit_key_hash: '' }),
			false,
		));

	it('is true once the action and required ids are set', () =>
		assert.equal(isSubmitConfigured('https://example.com/formResponse', ids), true));
});

describe('toFormEntries', () => {
	it('maps field names onto entry ids', () =>
		assert.deepEqual(toFormEntries({ name: 'Rizky', slug: 'rizky' }, ids), [
			['entry.2', 'Rizky'],
			['entry.1', 'rizky'],
		]));

	it('drops empty values so a partial edit does not wipe data', () =>
		assert.deepEqual(toFormEntries({ name: 'Rizky', bio: '', platform: '   ' }, ids), [
			['entry.2', 'Rizky'],
		]));

	it('drops fields with no id configured', () =>
		assert.deepEqual(toFormEntries({ name: 'Rizky', handle: '@x' }, ids), [['entry.2', 'Rizky']]));

	it('trims values', () =>
		assert.deepEqual(toFormEntries({ name: '  Rizky  ' }, ids), [['entry.2', 'Rizky']]));

	it('never emits the raw key, only the hash field', () => {
		const entries = toFormEntries({ name: 'X', edit_key_hash: 'a'.repeat(64) }, ids);
		assert.deepEqual(entries, [
			['entry.2', 'X'],
			['entry.9', 'a'.repeat(64)],
		]);
	});

	it('returns nothing for an empty payload', () => assert.deepEqual(toFormEntries({}, ids), []));
});

describe('slugify agreement between browser and sync', () => {
	// The browser derives a slug to target an existing profile; the Action derives
	// one to name the file. Drift here would create duplicates instead of updates.
	it('matches the sync rules implementation', async () => {
		const { slugify: syncSlugify } = await import('../scripts/lib/sync-rules.mjs');
		for (const name of ['Rizky Plays', 'Pokémon UNITE', 'Nova!! Squad', '  ...X...  ', '']) {
			assert.equal(slugify(name), syncSlugify(name), `mismatch for ${JSON.stringify(name)}`);
		}
	});
});
