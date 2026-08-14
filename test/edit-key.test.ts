import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	generateEditKey,
	normaliseEditKey,
	isWellFormedEditKey,
	hashEditKey,
	editKeyHashesMatch,
} from '../src/lib/edit-key.ts';

describe('generateEditKey', () => {
	it('produces 128 bits as 8 groups of 4 hex chars', () => {
		const key = generateEditKey();
		assert.match(key, /^[0-9A-F]{4}(-[0-9A-F]{4}){7}$/);
		assert.equal(normaliseEditKey(key).length, 32);
	});

	it('does not repeat across many draws', () => {
		const seen = new Set(Array.from({ length: 500 }, () => generateEditKey()));
		assert.equal(seen.size, 500);
	});
});

describe('normaliseEditKey', () => {
	it('strips dashes and lowercases', () =>
		assert.equal(normaliseEditKey('ABCD-1234'), 'abcd1234'));

	it('tolerates spaces and stray punctuation', () =>
		assert.equal(normaliseEditKey(' ab cd_12.34 '), 'abcd1234'));

	it('is idempotent', () => {
		const once = normaliseEditKey('ABCD-1234');
		assert.equal(normaliseEditKey(once), once);
	});
});

describe('isWellFormedEditKey', () => {
	it('accepts a generated key', () => assert.ok(isWellFormedEditKey(generateEditKey())));
	it('accepts the same key without dashes', () =>
		assert.ok(isWellFormedEditKey(normaliseEditKey(generateEditKey()))));
	it('rejects a short key', () => assert.equal(isWellFormedEditKey('ABCD-1234'), false));
	it('rejects an empty key', () => assert.equal(isWellFormedEditKey(''), false));
});

describe('hashEditKey', () => {
	it('returns 64 lowercase hex chars', async () =>
		assert.match(await hashEditKey(generateEditKey()), /^[0-9a-f]{64}$/));

	it('matches a known SHA-256 vector', async () =>
		// sha256("abc") - proves we hash the normalised text, not raw bytes of the input
		assert.equal(
			await hashEditKey('ABC'),
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
		));

	it('is insensitive to formatting, so a retyped key still matches', async () => {
		const key = generateEditKey();
		const [a, b, c] = await Promise.all([
			hashEditKey(key),
			hashEditKey(key.toLowerCase()),
			hashEditKey(key.replace(/-/g, '')),
		]);
		assert.equal(a, b);
		assert.equal(a, c);
	});

	it('gives different hashes for different keys', async () => {
		const [a, b] = await Promise.all([
			hashEditKey(generateEditKey()),
			hashEditKey(generateEditKey()),
		]);
		assert.notEqual(a, b);
	});
});

describe('editKeyHashesMatch', () => {
	it('matches identical hashes', async () => {
		const h = await hashEditKey('ABCD-1234');
		assert.ok(editKeyHashesMatch(h, h));
	});

	it('rejects different hashes', async () => {
		const [a, b] = await Promise.all([hashEditKey('one'), hashEditKey('two')]);
		assert.equal(editKeyHashesMatch(a, b), false);
	});

	it('rejects a length mismatch without throwing', () =>
		assert.equal(editKeyHashesMatch('abc', 'abcd'), false));
});
