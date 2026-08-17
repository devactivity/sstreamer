/**
 * Submitting to the Google Form that feeds the private responses sheet.
 *
 * Why a Google Form at all: the responses sheet must stay private, because it holds
 * the edit key hashes and a published hash could be replayed to impersonate a
 * streamer. A Form writes to its linked sheet regardless of whether that sheet is
 * published, so the endpoint is public while the data is not.
 *
 * Fill in FORM_ACTION and FIELD_IDS from the live form's HTML - see SETUP.md. Until
 * then `isSubmitConfigured()` is false and the forms stay in preview mode, saying so
 * rather than pretending to send.
 */

// Extension included because this module is also loaded by `node --test`, which does
// not resolve extensionless paths. See tsconfig's allowImportingTsExtensions.
import { postToForm, toEntries } from './form-post.ts';

/** Every field the sheet understands. Keep in step with the columns in SETUP.md. */
export type SubmitField =
	| 'slug'
	| 'name'
	| 'aliases'
	| 'bio'
	| 'timezone'
	| 'games'
	| 'platform'
	| 'handle'
	| 'game'
	| 'days'
	| 'start'
	| 'duration_min'
	| 'title'
	/** Schedule blocks past the first, packed. See `schedule-encode.ts`. */
	| 'streams'
	/**
	 * Where the streamer's picture can be fetched from. Deliberately NOT `avatar`:
	 * the schema's `avatar` is a repo-relative path, and a URL landing there fails
	 * the build, which fails the whole sync run for everybody. This never reaches
	 * the YAML - it only puts the request in front of you.
	 */
	| 'avatar_url'
	| 'edit_key_hash';

/** The form's POST target, ending in /formResponse. */
export const FORM_ACTION =
	'https://docs.google.com/forms/d/e/1FAIpQLSebsPGy0fIIkijf8dNKXd02peyuuTI3cz3NqL8JovWbK5fJ_w/formResponse';

/**
 * Google's per-question ids, taken from the form's pre-filled link.
 *
 * These are tied to the questions in that specific form. Deleting and re-creating a
 * question mints a new id, so if submissions ever start vanishing silently, re-check
 * these before anything else - a wrong id is dropped without an error, because the
 * response is opaque to us.
 */
export const FIELD_IDS: Record<SubmitField, string> = {
	slug: 'entry.16996022',
	name: 'entry.1962148576',
	aliases: 'entry.485416370',
	bio: 'entry.203514593',
	timezone: 'entry.2025653579',
	games: 'entry.1311019079',
	platform: 'entry.677791728',
	handle: 'entry.1437226508',
	game: 'entry.835559590',
	days: 'entry.1506235148',
	start: 'entry.1356248885',
	duration_min: 'entry.1360799624',
	title: 'entry.1585455517',
	streams: 'entry.1503661019',
	avatar_url: 'entry.1010210650',
	edit_key_hash: 'entry.1568322364',
};

/** Without these a submission can't be matched to a profile or authenticated. */
const REQUIRED_FIELDS: SubmitField[] = ['name', 'edit_key_hash'];

export function isSubmitConfigured(
	action: string = FORM_ACTION,
	ids: Record<SubmitField, string> = FIELD_IDS,
): boolean {
	return action.trim() !== '' && REQUIRED_FIELDS.every((f) => ids[f]?.trim() !== '');
}

export class SubmitNotConfiguredError extends Error {
	constructor() {
		super('submission form is not configured yet');
		this.name = 'SubmitNotConfiguredError';
	}
}

/** Map submission fields onto entry ids. See `toEntries` for the dropping rules. */
export function toFormEntries(
	fields: Partial<Record<SubmitField, string>>,
	ids: Record<SubmitField, string> = FIELD_IDS,
): [string, string][] {
	return toEntries(fields, ids);
}

/**
 * Send a submission. Resolving means the request left the browser, not that the form
 * accepted it - the response is opaque. See `postToForm`.
 */
export async function submitToForm(fields: Partial<Record<SubmitField, string>>): Promise<void> {
	if (!isSubmitConfigured()) throw new SubmitNotConfiguredError();
	await postToForm(FORM_ACTION, toFormEntries(fields));
}
