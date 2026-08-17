/**
 * The contact form: the one route around the edit key check.
 *
 * Deliberately a different form and a different spreadsheet from the submissions in
 * `submit.ts`, for two independent reasons:
 *
 *  1. The sync reads the submissions sheet and parses every row as a profile. A
 *     free-text message landing there would be read as a name, a schedule, a set of
 *     games, and would queue nonsense on every run.
 *  2. The Apps Script that pushes these to Telegram is bound to a spreadsheet and
 *     fires on any form submission into it. Sharing one spreadsheet would send a
 *     notification for every profile edit as well, which is exactly the noise that
 *     makes people stop reading notifications.
 *
 * The service account has no access to the contact spreadsheet and does not need any.
 * Nothing here ever reaches the repo: messages are read by a human and acted on by
 * hand. See SETUP.md.
 */

// Extension included because this module is also loaded by `node --test`, which does
// not resolve extensionless paths. See tsconfig's allowImportingTsExtensions.
import { postToForm, toEntries } from './form-post.ts';

export type ContactField =
	/** Who is writing, ideally the profile name so it can be matched to a streamer. */
	| 'name'
	/** Where a reply can go. Without it a lost key cannot be resolved. */
	| 'reply'
	| 'message';

/**
 * The contact form's POST target, ending in /formResponse.
 *
 * Note this id is not the one in the form's editing URL. That one is private to you;
 * this is the public response id, taken from the live form or a pre-filled link.
 */
export const CONTACT_ACTION =
	'https://docs.google.com/forms/d/e/1FAIpQLSfGQH1DUcz3dSZILNdH8tQ-YPwi9uYKNP5huradEBT3Q8XJ1w/formResponse';

/** Google's per-question ids, taken from the contact form's pre-filled link. */
export const CONTACT_FIELD_IDS: Record<ContactField, string> = {
	name: 'entry.141031439',
	reply: 'entry.320707000',
	message: 'entry.434662184',
};

/**
 * Without a message there is nothing to send. `name` and `reply` are optional on
 * purpose: somebody reporting a wrong name should not be forced to identify
 * themselves, and demanding an email of everyone loses the reports that matter.
 */
const REQUIRED_FIELDS: ContactField[] = ['message'];

export function isContactConfigured(
	action: string = CONTACT_ACTION,
	ids: Record<ContactField, string> = CONTACT_FIELD_IDS,
): boolean {
	return action.trim() !== '' && REQUIRED_FIELDS.every((f) => ids[f]?.trim() !== '');
}

export class ContactNotConfiguredError extends Error {
	constructor() {
		super('contact form is not configured yet');
		this.name = 'ContactNotConfiguredError';
	}
}

/** Map contact fields onto entry ids. See `toEntries` for the dropping rules. */
export function toContactEntries(
	fields: Partial<Record<ContactField, string>>,
	ids: Record<ContactField, string> = CONTACT_FIELD_IDS,
): [string, string][] {
	return toEntries(fields, ids);
}

/**
 * Send a contact message. Resolving means the request left the browser, not that the
 * form accepted it - the response is opaque. See `postToForm`.
 */
export async function submitContact(
	fields: Partial<Record<ContactField, string>>,
): Promise<void> {
	if (!isContactConfigured()) throw new ContactNotConfiguredError();
	await postToForm(CONTACT_ACTION, toContactEntries(fields));
}
