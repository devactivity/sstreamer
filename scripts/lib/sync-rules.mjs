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
 *
 * `channels` is not here because it is only conditionally protected. See `dropsChannel`.
 */
export const KEY_PROTECTED_FIELDS = ['name', 'avatar'];

/**
 * Whether a channel change destroys something, rather than only adding.
 *
 * Adding a platform is ordinary: a streamer who starts streaming on YouTube as well
 * should not wait on a human for it. Removing a channel, or repointing an existing one
 * at a different account, gets the same look as a rename, because both send the
 * profile's traffic somewhere the last approved version did not.
 *
 * This matters beyond a stolen key. A submission replaces the channel list rather than
 * merging into it, so an edit made from a form that has fallen out of step with the
 * profile would otherwise delete the channels it did not know about, automatically and
 * with nothing to notice.
 *
 * Compared on platform and handle only. Reordering which channel is primary loses
 * nothing, so it is not worth stopping.
 */
export function dropsChannel(existing, patch) {
	if (!Array.isArray(existing?.channels) || !Array.isArray(patch?.channels)) return false;

	const key = (c) => `${String(c.platform).toLowerCase()} ${String(c.handle).toLowerCase()}`;
	const kept = new Set(patch.channels.map(key));
	return existing.channels.some((c) => !kept.has(key(c)));
}

/** Truthy spellings a human might put in the `approved` column. */
const TRUTHY = new Set(['true', 'yes', 'y', '1', 'ok', 'approved', 'ya', 'setuju']);

export function isApproved(value) {
	return TRUTHY.has(String(value ?? '').trim().toLowerCase());
}

// Re-exported from the shared module so the Action and the browser cannot drift.
// A mismatch would silently create duplicate profiles instead of updating them.
export { slugify } from '../../src/lib/text.ts';

// Same reason: the browser encodes extra schedule blocks, this decodes them, and a
// divergent format would drop schedules without any error to notice.
import { DEFAULT_DURATION, decodeBlocks } from '../../src/lib/schedule-encode.ts';
import { decodeChannels } from '../../src/lib/channel-encode.ts';

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

	// `avatar` is a repo-relative path that Astro resolves at build time, so it can
	// only ever be set by hand. Note there is deliberately no `row.avatar` here: a URL
	// written into this field fails the build, and the sync build-verifies before
	// committing, so one bad value would stop the run for every streamer in it.
	// Requests arrive in `avatar_url` instead and are surfaced, never applied.

	// Persist the key hash, or a created profile would have nothing to check future
	// edits against and every one of them would queue forever. Only well-formed
	// hashes are stored: garbage here would fail the Zod schema and break the build.
	const keyHash = row.edit_key_hash?.trim().toLowerCase();
	if (keyHash && /^[0-9a-f]{64}$/.test(keyHash)) patch.edit_key_hash = keyHash;

	const aliases = splitList(row.aliases);
	if (aliases.length > 0) patch.aliases = aliases;

	// The first channel keeps its own columns; the rest arrive packed in one. Combined
	// rather than replaced one by one, because the schema wants a single ordered list
	// and the first entry is what the profile page treats as primary.
	//
	// This still replaces the whole list rather than merging into the existing one, so
	// a submission that omits a channel drops it. That is deliberate - it is how a
	// streamer removes a channel at all - and it is why `channels` is key-protected:
	// the removal goes past you rather than applying on its own.
	const channels = [];
	if (row.platform?.trim() && row.handle?.trim()) {
		channels.push({ platform: row.platform.trim().toLowerCase(), handle: row.handle.trim() });
	}
	channels.push(...decodeChannels(row.channels));

	const seenChannels = new Set();
	const uniqueChannels = channels.filter((c) => {
		const key = `${c.platform} ${c.handle.toLowerCase()}`;
		if (seenChannels.has(key)) return false;
		seenChannels.add(key);
		return true;
	});

	if (uniqueChannels.length > 0) {
		patch.channels = uniqueChannels.map((c, i) => ({ ...c, primary: i === 0 }));
	}

	const recurring = [];
	/** What a block falls back to when it names no platform of its own. */
	const platform = row.platform?.trim().toLowerCase();

	// The first block has its own columns, kept as-is so no existing form question or
	// entry id has to change. Everything after it arrives packed in one column.
	const days = splitList(row.days);
	if (days.length > 0 && row.start?.trim()) {
		const duration = Number(row.duration_min);
		// Built in one literal rather than assigned piecemeal, so the inferred shape
		// is complete - otherwise later property adds are invisible to the checker.
		recurring.push({
			days,
			start: row.start.trim(),
			duration_min:
				Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION,
			...(row.title?.trim() ? { title: row.title.trim() } : {}),
			...(row.game?.trim() ? { game: row.game.trim() } : {}),
			...(platform ? { platform } : {}),
		});
	}

	for (const block of decodeBlocks(row.streams)) {
		// A block may name its own platform, for a streamer who plays one game on
		// YouTube and another on TikTok. Falls back to the profile's primary, which is
		// what every block did before the packed format carried a platform at all.
		const blockPlatform = block.platform ?? platform;
		recurring.push({
			days: block.days,
			start: block.start,
			duration_min: block.duration_min,
			...(block.game ? { game: block.game } : {}),
			...(blockPlatform ? { platform: blockPlatform } : {}),
		});
	}

	// Replaces the schedule wholesale, so a submission that mentions no schedule at all
	// leaves the existing one alone rather than clearing it.
	if (recurring.length > 0) patch.schedule = { recurring, overrides: [] };

	// Union rather than just the `games` column: a block naming a game the column
	// omitted would otherwise never appear on that game's page.
	const games = [
		...new Set([...splitList(row.games), ...recurring.map((r) => r.game).filter(Boolean)]),
	];
	if (games.length > 0) patch.games = games;

	return patch;
}

/**
 * The picture a streamer asked for, if they asked for one and the value is plausibly
 * fetchable. Only http(s) is accepted: this ends up in a log you will click, and
 * `javascript:`, `file:` or `data:` have no business being there.
 *
 * Returns undefined rather than an empty string so callers can test it directly.
 */
export function avatarUrl(row) {
	const raw = row.avatar_url?.trim();
	if (!raw) return undefined;
	try {
		const { protocol } = new URL(raw);
		return protocol === 'http:' || protocol === 'https:' ? raw : undefined;
	} catch {
		return undefined;
	}
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
 *
 * `patch` is any partial streamer record, not only what submissionToPatch produces.
 * The protected-field check has to hold for fields no submission can currently reach,
 * so typing it to today's output would make that guard untestable.
 *
 * @param {{
 *   row: Record<string, any>,
 *   existing?: Record<string, any> | null,
 *   patch?: Record<string, any>,
 * }} input
 */
export function decideSubmission({ row, existing, patch = submissionToPatch(row) }) {
	// Attached to whatever the row does rather than replacing it: a streamer who
	// changes their schedule and asks for a picture in one submission should still get
	// the schedule change, and the picture is a manual job either way. Carried out here
	// so it survives every branch below, including `skip`, which is what a row asking
	// for nothing but a picture would otherwise be.
	return { ...decideAction({ row, existing, patch }), avatarRequest: avatarUrl(row) };
}

function decideAction({ row, existing, patch }) {
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
	if (changed.includes('channels') && dropsChannel(existing, patch)) protectedHits.push('channels');

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
