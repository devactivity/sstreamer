import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	toContactEntries,
	isContactConfigured,
	CONTACT_ACTION,
	CONTACT_FIELD_IDS,
	type ContactField,
} from '../src/lib/contact.ts';
import { FIELD_IDS, FORM_ACTION } from '../src/lib/submit.ts';

const ids: Record<ContactField, string> = {
	name: 'entry.1',
	reply: 'entry.2',
	message: 'entry.3',
};

describe('isContactConfigured', () => {
	// Guards the real config: blanking the action or the message id drops the contact
	// page back to preview mode and hides the footer link, silently.
	it('the shipped config is complete', () =>
		assert.equal(isContactConfigured(CONTACT_ACTION, CONTACT_FIELD_IDS), true));

	it('is false with an action but no message id', () =>
		assert.equal(
			isContactConfigured('https://example.com/formResponse', { ...ids, message: '' }),
			false,
		));

	// name and reply are optional by design: forcing either loses the reports that
	// matter most, like somebody flagging a name that is not theirs.
	it('is true with only the message wired', () =>
		assert.equal(
			isContactConfigured('https://example.com/formResponse', {
				name: '',
				reply: '',
				message: 'entry.3',
			}),
			true,
		));

	it('is false with ids but no action', () => assert.equal(isContactConfigured('', ids), false));

	it('is true once the action and message id are set', () =>
		assert.equal(isContactConfigured('https://example.com/formResponse', ids), true));

	/**
	 * The two forms must stay separate. Sharing an endpoint would drop free-text
	 * messages into the submissions sheet, where the sync parses every row as a
	 * profile, and would fire the Telegram trigger on every profile edit.
	 */
	it('does not share an endpoint with the submissions form', () =>
		assert.notEqual(CONTACT_ACTION, FORM_ACTION));

	it('does not reuse a submissions entry id', () => {
		const submissionIds = new Set(Object.values(FIELD_IDS).filter(Boolean));
		for (const [field, id] of Object.entries(CONTACT_FIELD_IDS)) {
			assert.equal(submissionIds.has(id), false, `${field} reuses a submissions id: ${id}`);
		}
	});

	// All three are wired, so none may be blank: an id that is missing or malformed is
	// dropped by Google without an error, and the response is opaque to us.
	it('every field has a well-formed id', () => {
		for (const [field, id] of Object.entries(CONTACT_FIELD_IDS)) {
			assert.match(id, /^entry\.\d+$/, `${field} has a malformed id: ${id}`);
		}
	});

	it('the action points at formResponse, not viewform', () =>
		assert.match(CONTACT_ACTION, /\/formResponse$/));

	// The editing URL uses a different id and is not a submission endpoint. Posting to
	// it would fail, and the failure is invisible because the response is opaque.
	it('uses the public response id, not the editing one', () =>
		assert.match(CONTACT_ACTION, /\/forms\/d\/e\//));
});

describe('toContactEntries', () => {
	it('maps field names onto entry ids', () =>
		assert.deepEqual(toContactEntries({ name: 'Rizky', message: 'halo' }, ids), [
			['entry.1', 'Rizky'],
			['entry.3', 'halo'],
		]));

	it('drops the optional fields when left blank', () =>
		assert.deepEqual(toContactEntries({ name: '', reply: '   ', message: 'halo' }, ids), [
			['entry.3', 'halo'],
		]));

	it('keeps a multi-line message intact', () => {
		const message = 'line one\nline two\n\nline four';
		assert.deepEqual(toContactEntries({ message }, ids), [['entry.3', message]]);
	});

	it('drops fields with no id configured', () =>
		assert.deepEqual(toContactEntries({ name: 'Rizky', message: 'halo' }, { ...ids, name: '' }), [
			['entry.3', 'halo'],
		]));

	it('returns nothing for an empty payload', () => assert.deepEqual(toContactEntries({}, ids), []));
});
