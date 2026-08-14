/**
 * Pure decision logic for the sheet sync. Kept free of I/O so it can be tested
 * without credentials, since the auth path can't be exercised locally.
 *
 * The security boundary lives here: this runs inside the GitHub Action, which is
 * the only place a key check is meaningful. A browser-side check is decoration -
 * anyone can POST straight to the form endpoint and skip the page's JavaScript.
 */

/**
 * Changes to these still queue for review even with a valid key. They are the
 * impersonation-sensitive fields: a stolen or shared key shouldn't be able to
 * rename a profile or swap its picture without a human seeing it.
 */
export const KEY_PROTECTED_FIELDS = ['name', 'avatar'];

/** Truthy spellings a human might put in the `approved` column. */
const TRUTHY = new Set(['true', 'yes', 'y', '1', 'ok', 'approved', 'ya', 'setuju']);

export function isApproved(value) {
	return TRUTHY.has(String(value ?? '').trim().toLowerCase());
}

// Re-exported from the shared module so the Action and the browser cannot drift.
// A mismatch would silently create duplicate profiles instead of updating them.
export { slugify } from '../../src/lib/text.ts';

const splitList = (value) =>
	String(value ?? '')
		.split(/[|,]/)
		.map((s) => s.trim())
		.filter(Boolean);

/**
 * Turn one submission row into a partial streamer record. Only keys the submitter
 * actually filled in are present, so a blank field means "leave alone" rather than
 * "clear it" - otherwise a half-filled edit form would wipe existing data.
 */
export function submissionToPatch(row) {
	const patch = {};

	if (row.name?.trim()) patch.name = row.name.trim();
	if (row.bio?.trim()) patch.bio = row.bio.trim();
	if (row.timezone?.trim()) patch.timezone = row.timezone.trim();
	if (row.avatar?.trim()) patch.avatar = row.avatar.trim();

	// Persist the key hash, or a created profile would have nothing to check future
	// edits against and every one of them would queue forever. Only well-formed
	// hashes are stored: garbage here would fail the Zod schema and break the build.
	const keyHash = row.edit_key_hash?.trim().toLowerCase();
	if (keyHash && /^[0-9a-f]{64}$/.test(keyHash)) patch.edit_key_hash = keyHash;

	const games = splitList(row.games);
	if (games.length > 0) patch.games = games;

	const aliases = splitList(row.aliases);
	if (aliases.length > 0) patch.aliases = aliases;

	if (row.platform?.trim() && row.handle?.trim()) {
		patch.channels = [
			{ platform: row.platform.trim(), handle: row.handle.trim(), primary: true },
		];
	}

	const days = splitList(row.days);
	if (days.length > 0 && row.start?.trim()) {
		const duration = Number(row.duration_min);
		// Built in one literal rather than assigned piecemeal, so the inferred shape
		// is complete - otherwise later property adds are invisible to the checker.
		patch.schedule = {
			recurring: [
				{
					days,
					start: row.start.trim(),
					duration_min: Number.isFinite(duration) && duration > 0 ? duration : 120,
					...(row.title?.trim() ? { title: row.title.trim() } : {}),
					...(row.game?.trim() ? { game: row.game.trim() } : {}),
					...(row.platform?.trim() ? { platform: row.platform.trim() } : {}),
				},
			],
			overrides: [],
		};
	}

	return patch;
}

/** Fields in the patch that would actually change the existing record. */
export function changedFields(existing, patch) {
	if (!existing) return Object.keys(patch);
	return Object.keys(patch).filter(
		(key) => JSON.stringify(existing[key]) !== JSON.stringify(patch[key]),
	);
}

/**
 * What to do with one submission.
 *
 *   create - a new profile you approved
 *   update - an edit carrying the right key, applied automatically
 *   queue  - needs your review; nothing is written
 *   skip   - nothing would change
 */
export function decideSubmission({ row, existing, patch = submissionToPatch(row) }) {
	const approved = isApproved(row.approved);
	const changed = changedFields(existing, patch);

	if (changed.length === 0 && existing) {
		return { action: 'skip', reason: 'no change', changed };
	}

	// An explicit tick in the sheet is you overriding everything below.
	if (approved) {
		return { action: existing ? 'update' : 'create', reason: 'approved in sheet', changed };
	}

	if (!existing) {
		// Nothing to verify a key against yet, and auto-creating would let anyone
		// publish a profile under any name.
		return { action: 'queue', reason: 'new profile needs approval', changed };
	}

	if (!row.edit_key_hash?.trim()) {
		return { action: 'queue', reason: 'no edit key supplied', changed };
	}

	if (!existing.edit_key_hash) {
		return { action: 'queue', reason: 'profile has no key on record', changed };
	}

	if (row.edit_key_hash.trim().toLowerCase() !== existing.edit_key_hash.toLowerCase()) {
		return { action: 'queue', reason: 'edit key does not match', changed };
	}

	const protectedHits = changed.filter((f) => KEY_PROTECTED_FIELDS.includes(f));
	if (protectedHits.length > 0) {
		return {
			action: 'queue',
			reason: `key valid but touches protected field(s): ${protectedHits.join(', ')}`,
			changed,
		};
	}

	return { action: 'update', reason: 'valid edit key', changed };
}

/** Merge an approved patch onto the existing record. */
export function applyPatch(existing, patch, today) {
	return {
		...(existing ?? { aliases: [], games: [], channels: [], verified: false }),
		...patch,
		updated: today,
	};
}
