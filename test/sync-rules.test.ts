import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	slugify,
	isApproved,
	submissionToPatch,
	changedFields,
	decideSubmission,
	applyPatch,
	avatarUrl,
	KEY_PROTECTED_FIELDS,
} from '../scripts/lib/sync-rules.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('slugify', () => {
	it('lowercases and hyphenates', () => assert.equal(slugify('Rizky Plays'), 'rizky-plays'));
	it('strips accents', () => assert.equal(slugify('Pokémon UNITE'), 'pokemon-unite'));
	it('collapses punctuation', () =>
		assert.equal(slugify('Nova!! Squad??  Gaming'), 'nova-squad-gaming'));
	it('trims leading and trailing hyphens', () => assert.equal(slugify('  ...Nova...  '), 'nova'));
	it('handles an empty name', () => assert.equal(slugify(''), ''));
});

describe('isApproved', () => {
	it('accepts common spellings', () => {
		for (const v of ['TRUE', 'yes', 'y', '1', 'ok', 'Ya', ' setuju ']) {
			assert.ok(isApproved(v), `expected ${v} to be approved`);
		}
	});
	it('rejects blanks and negatives', () => {
		for (const v of ['', ' ', 'no', 'false', '0', undefined, null]) {
			assert.equal(isApproved(v), false, `expected ${v} to be rejected`);
		}
	});
});

describe('submissionToPatch', () => {
	it('omits blank fields so a partial edit does not wipe data', () => {
		const patch = submissionToPatch({ name: 'Rizky', bio: '', games: '  ' });
		assert.deepEqual(Object.keys(patch), ['name']);
	});

	it('splits lists on pipes or commas', () => {
		const patch = submissionToPatch({ games: 'mobile-legends|free-fire', aliases: 'a, b' });
		assert.deepEqual(patch.games, ['mobile-legends', 'free-fire']);
		assert.deepEqual(patch.aliases, ['a', 'b']);
	});

	it('builds a channel only when platform and handle are both present', () => {
		assert.equal(submissionToPatch({ platform: 'youtube' }).channels, undefined);
		assert.deepEqual(submissionToPatch({ platform: 'youtube', handle: '@x' }).channels, [
			{ platform: 'youtube', handle: '@x', primary: true },
		]);
	});

	it('builds a schedule block from days plus start', () => {
		const patch = submissionToPatch({
			days: 'mon|wed',
			start: '20:00',
			duration_min: '180',
			title: 'Push rank',
			game: 'mobile-legends',
			platform: 'youtube',
		});
		assert.deepEqual(patch.schedule, {
			recurring: [
				{
					days: ['mon', 'wed'],
					start: '20:00',
					duration_min: 180,
					title: 'Push rank',
					game: 'mobile-legends',
					platform: 'youtube',
				},
			],
			overrides: [],
		});
	});

	it('defaults a missing or invalid duration to 120', () => {
		assert.equal(submissionToPatch({ days: 'mon', start: '20:00' }).schedule.recurring[0].duration_min, 120);
		assert.equal(
			submissionToPatch({ days: 'mon', start: '20:00', duration_min: 'abc' }).schedule
				.recurring[0].duration_min,
			120,
		);
	});

	it('ignores days without a start time', () =>
		assert.equal(submissionToPatch({ days: 'mon|wed' }).schedule, undefined));

	it('appends packed blocks after the one built from the dedicated columns', () => {
		const patch = submissionToPatch({
			days: 'mon|wed',
			start: '20:00',
			game: 'mobile-legends',
			platform: 'youtube',
			handle: '@x',
			streams: 'valorant|sat,sun|12:00|180',
		});
		assert.deepEqual(patch.schedule.recurring, [
			{
				days: ['mon', 'wed'],
				start: '20:00',
				duration_min: 120,
				game: 'mobile-legends',
				platform: 'youtube',
			},
			{
				days: ['sat', 'sun'],
				start: '12:00',
				duration_min: 180,
				game: 'valorant',
				platform: 'youtube',
			},
		]);
	});

	it('builds a schedule from packed blocks even when the first slot is empty', () => {
		const patch = submissionToPatch({ streams: 'valorant|sat|12:00|180' });
		assert.deepEqual(patch.schedule.recurring, [
			{ days: ['sat'], start: '12:00', duration_min: 180, game: 'valorant' },
		]);
	});

	// A game named only inside a block would otherwise never reach that game's page,
	// because the page is built from `games`, not from the schedule.
	it('unions games from the column and from every block', () => {
		const patch = submissionToPatch({
			games: 'mobile-legends',
			days: 'mon',
			start: '20:00',
			game: 'mobile-legends',
			streams: 'valorant|sat|12:00|180;genshin-impact|sun|10:00|60',
		});
		assert.deepEqual(patch.games, ['mobile-legends', 'valorant', 'genshin-impact']);
	});

	it('leaves the schedule alone when nothing schedule-shaped was submitted', () =>
		assert.equal(submissionToPatch({ bio: 'hi', streams: '' }).schedule, undefined));

	it('keeps the first block when the packed field is malformed', () => {
		const patch = submissionToPatch({ days: 'mon', start: '20:00', streams: 'garbage' });
		assert.equal(patch.schedule.recurring.length, 1);
		assert.deepEqual(patch.schedule.recurring[0].days, ['mon']);
	});

	/**
	 * `avatar` is a repo-relative path resolved by Astro at build time. A URL there
	 * fails the build, and the sync build-verifies before committing, so a single bad
	 * value would stop the run for every streamer in it. Nothing from a submission may
	 * reach this field, whatever the column is called.
	 */
	it('never writes an avatar, however the row spells it', () => {
		for (const row of [
			{ avatar: 'https://example.com/x.png' },
			{ avatar: './avatars/evil.png' },
			{ avatar_url: 'https://example.com/x.png' },
		]) {
			assert.ok(!('avatar' in submissionToPatch(row)), JSON.stringify(row));
		}
	});

	// Without this the created profile stores no key, and every later edit is
	// rejected with "profile has no key on record" - the feature dies silently.
	it('persists a well-formed edit key hash', () =>
		assert.equal(submissionToPatch({ edit_key_hash: HASH_A }).edit_key_hash, HASH_A));

	it('lowercases the stored hash so comparisons are stable', () =>
		assert.equal(
			submissionToPatch({ edit_key_hash: HASH_A.toUpperCase() }).edit_key_hash,
			HASH_A,
		));

	it('drops a malformed hash rather than breaking the schema', () => {
		for (const bad of ['', '   ', 'not-a-hash', 'abc123', 'z'.repeat(64), HASH_A.slice(0, 63)]) {
			assert.equal(
				submissionToPatch({ edit_key_hash: bad }).edit_key_hash,
				undefined,
				`should have rejected ${JSON.stringify(bad)}`,
			);
		}
	});
});

describe('avatarUrl', () => {
	it('accepts http and https', () => {
		assert.equal(
			avatarUrl({ avatar_url: 'https://i.imgur.com/x.png' }),
			'https://i.imgur.com/x.png',
		);
		assert.equal(avatarUrl({ avatar_url: 'http://example.com/x.png' }), 'http://example.com/x.png');
	});

	it('trims, because a spreadsheet cell will have whitespace', () =>
		assert.equal(
			avatarUrl({ avatar_url: '  https://example.com/x.png  ' }),
			'https://example.com/x.png',
		));

	it('is undefined when nothing was asked for', () => {
		assert.equal(avatarUrl({}), undefined);
		assert.equal(avatarUrl({ avatar_url: '' }), undefined);
		assert.equal(avatarUrl({ avatar_url: '   ' }), undefined);
	});

	// This value gets printed into a log that a human then clicks.
	it('rejects schemes that have no business in a log you will click', () => {
		for (const bad of [
			'javascript:alert(1)',
			'data:text/html,<script>alert(1)</script>',
			'file:///etc/passwd',
			'not a url at all',
		]) {
			assert.equal(avatarUrl({ avatar_url: bad }), undefined, bad);
		}
	});
});

describe('changedFields', () => {
	it('treats everything as changed for a new profile', () =>
		assert.deepEqual(changedFields(null, { name: 'X', bio: 'Y' }), ['name', 'bio']));

	it('reports only fields that differ', () =>
		assert.deepEqual(changedFields({ name: 'X', bio: 'Y' }, { name: 'X', bio: 'Z' }), ['bio']));

	it('compares arrays by value', () =>
		assert.deepEqual(changedFields({ games: ['a', 'b'] }, { games: ['a', 'b'] }), []));
});

describe('decideSubmission', () => {
	const existing = { name: 'Rizky', edit_key_hash: HASH_A, bio: 'old' };

	it('auto-applies an edit with a matching key', () => {
		const d = decideSubmission({
			row: { edit_key_hash: HASH_A, bio: 'new bio' },
			existing,
		});
		assert.equal(d.action, 'update');
	});

	it('queues an edit with a wrong key', () => {
		const d = decideSubmission({ row: { edit_key_hash: HASH_B, bio: 'new' }, existing });
		assert.equal(d.action, 'queue');
		assert.match(d.reason, /does not match/);
	});

	it('is case-insensitive about the submitted hash', () => {
		const d = decideSubmission({
			row: { edit_key_hash: HASH_A.toUpperCase(), bio: 'new' },
			existing,
		});
		assert.equal(d.action, 'update');
	});

	it('queues an edit with no key at all', () => {
		const d = decideSubmission({ row: { bio: 'new' }, existing });
		assert.equal(d.action, 'queue');
		assert.match(d.reason, /no edit key/);
	});

	it('queues when the profile has no key on record', () => {
		const d = decideSubmission({
			row: { edit_key_hash: HASH_A, bio: 'new' },
			existing: { name: 'Rizky', bio: 'old' },
		});
		assert.equal(d.action, 'queue');
		assert.match(d.reason, /no key on record/);
	});

	it('queues a new profile even though nothing is wrong with it', () => {
		const d = decideSubmission({ row: { name: 'Baru', edit_key_hash: HASH_A }, existing: null });
		assert.equal(d.action, 'queue');
		assert.match(d.reason, /needs approval/);
	});

	it('creates a new profile once approved in the sheet', () => {
		const d = decideSubmission({
			row: { name: 'Baru', edit_key_hash: HASH_A, approved: 'yes' },
			existing: null,
		});
		assert.equal(d.action, 'create');
	});

	it('queues a rename even with a valid key', () => {
		const d = decideSubmission({
			row: { edit_key_hash: HASH_A, name: 'Someone Else' },
			existing,
		});
		assert.equal(d.action, 'queue');
		assert.match(d.reason, /protected field/);
		assert.ok(KEY_PROTECTED_FIELDS.includes('name'));
	});

	// No submission can reach `avatar` any more, so the patch is supplied directly
	// here. The guard stays as defence in depth: it is what would have to hold if an
	// avatar intake is ever added, and it should not quietly rot in the meantime.
	it('queues an avatar swap even with a valid key', () => {
		const d = decideSubmission({
			row: { edit_key_hash: HASH_A },
			existing,
			patch: { avatar: './avatars/other.png' },
		});
		assert.equal(d.action, 'queue');
		assert.match(d.reason, /protected field/);
	});

	it('lets an explicit approval override a bad key', () => {
		const d = decideSubmission({
			row: { edit_key_hash: HASH_B, name: 'Renamed', approved: 'true' },
			existing,
		});
		assert.equal(d.action, 'update');
		assert.match(d.reason, /approved in sheet/);
	});

	it('skips a resubmission that changes nothing', () => {
		const d = decideSubmission({ row: { edit_key_hash: HASH_A, bio: 'old' }, existing });
		assert.equal(d.action, 'skip');
	});

	// A picture request changes nothing the sync can write, so the row is a `skip`.
	// If the request did not survive that branch, it would never be reported and the
	// streamer would be waiting on something nobody ever saw.
	it('reports a picture request even on a row that changes nothing else', () => {
		const d = decideSubmission({
			row: { edit_key_hash: HASH_A, bio: 'old', avatar_url: 'https://example.com/x.png' },
			existing,
		});
		assert.equal(d.action, 'skip');
		assert.equal(d.avatarRequest, 'https://example.com/x.png');
	});

	it('carries a picture request through without blocking the edit it came with', () => {
		const d = decideSubmission({
			row: { edit_key_hash: HASH_A, bio: 'new bio', avatar_url: 'https://example.com/x.png' },
			existing,
		});
		assert.equal(d.action, 'update');
		assert.deepEqual(d.changed, ['bio']);
		assert.equal(d.avatarRequest, 'https://example.com/x.png');
	});

	it('leaves avatarRequest undefined when none was asked for', () =>
		assert.equal(
			decideSubmission({ row: { edit_key_hash: HASH_A, bio: 'new' }, existing }).avatarRequest,
			undefined,
		));
});

describe('full lifecycle: create then edit with the same key', () => {
	// Mirrors what actually happens: ClaimForm sends two rows (name, then details),
	// then EditProfileForm sends a third later. The key issued in step 1 must still
	// authenticate the edit, which only works if the hash was persisted on create.
	const step1 = { name: 'Hurizz', slug: 'hurizz', edit_key_hash: HASH_A, approved: 'ya' };
	const step2 = {
		slug: 'hurizz',
		name: 'Hurizz',
		edit_key_hash: HASH_A,
		games: 'pokemon-unite',
		platform: 'tiktok',
		handle: 'hurizzgaming',
		game: 'pokemon-unite',
		days: 'sat|sun',
		start: '12:00',
	};

	it('row 1 creates the profile and stores the key', () => {
		const d = decideSubmission({ row: step1, existing: null });
		assert.equal(d.action, 'create');
		const created = applyPatch(null, submissionToPatch(step1), '2026-08-14');
		assert.equal(created.edit_key_hash, HASH_A);
	});

	it('row 2 applies automatically against the stored key, without approval', () => {
		const created = applyPatch(null, submissionToPatch(step1), '2026-08-14');
		const d = decideSubmission({ row: { ...step2, approved: '' }, existing: created });
		assert.equal(d.action, 'update');
		assert.match(d.reason, /valid edit key/);
	});

	it('a later edit with the same key also applies automatically', () => {
		const created = applyPatch(null, submissionToPatch(step1), '2026-08-14');
		const filled = applyPatch(created, submissionToPatch(step2), '2026-08-14');
		const laterEdit = { slug: 'hurizz', edit_key_hash: HASH_A, start: '20:00', days: 'mon' };

		const d = decideSubmission({ row: laterEdit, existing: filled });
		assert.equal(d.action, 'update');
		assert.equal(filled.channels[0].handle, 'hurizzgaming', 'earlier data survives');
	});

	it('a stranger with the wrong key still cannot edit it', () => {
		const created = applyPatch(null, submissionToPatch(step1), '2026-08-14');
		const d = decideSubmission({
			row: { slug: 'hurizz', edit_key_hash: HASH_B, start: '03:00' },
			existing: created,
		});
		assert.equal(d.action, 'queue');
		assert.match(d.reason, /does not match/);
	});
});

describe('applyPatch', () => {
	it('merges onto the existing record and stamps updated', () => {
		const merged = applyPatch({ name: 'X', bio: 'old', verified: true }, { bio: 'new' }, '2026-08-14');
		assert.equal(merged.name, 'X');
		assert.equal(merged.bio, 'new');
		assert.equal(merged.verified, true, 'must not silently drop verification');
		assert.equal(merged.updated, '2026-08-14');
	});

	it('creates sane defaults for a brand new profile', () => {
		const created = applyPatch(null, { name: 'Baru' }, '2026-08-14');
		assert.deepEqual(created.aliases, []);
		assert.deepEqual(created.games, []);
		assert.equal(created.verified, false);
		assert.equal(created.updated, '2026-08-14');
	});
});
