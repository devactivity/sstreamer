import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCsv, parseCsv, parseCsvRecords } from '../src/lib/csv.ts';

describe('encodeCsv', () => {
	it('leaves plain fields unquoted', () =>
		assert.equal(encodeCsv([['a', 'b']]), 'a,b'));

	it('quotes fields containing a delimiter', () =>
		assert.equal(encodeCsv([['a,b', 'c']]), '"a,b",c'));

	it('doubles embedded quotes', () =>
		assert.equal(encodeCsv([['say "hi"']]), '"say ""hi"""'));

	it('quotes fields containing newlines', () =>
		assert.equal(encodeCsv([['line1\nline2']]), '"line1\nline2"'));

	it('joins rows with CRLF', () =>
		assert.equal(encodeCsv([['a'], ['b']]), 'a\r\nb'));

	it('preserves empty fields', () => assert.equal(encodeCsv([['', 'x', '']]), ',x,'));
});

describe('parseCsv', () => {
	it('parses plain rows', () =>
		assert.deepEqual(parseCsv('a,b\r\nc,d'), [
			['a', 'b'],
			['c', 'd'],
		]));

	it('accepts LF-only line endings', () =>
		assert.deepEqual(parseCsv('a,b\nc,d'), [
			['a', 'b'],
			['c', 'd'],
		]));

	it('parses quoted fields with delimiters', () =>
		assert.deepEqual(parseCsv('"a,b",c'), [['a,b', 'c']]));

	it('parses doubled quotes', () =>
		assert.deepEqual(parseCsv('"say ""hi"""'), [['say "hi"']]));

	it('parses embedded newlines inside quotes', () =>
		assert.deepEqual(parseCsv('"line1\nline2",x'), [['line1\nline2', 'x']]));

	it('ignores a single trailing newline', () =>
		assert.deepEqual(parseCsv('a,b\r\n'), [['a', 'b']]));

	it('preserves empty fields', () => assert.deepEqual(parseCsv(',x,'), [['', 'x', '']]));
});

describe('round trip', () => {
	// The restore path overwrites live data, so anything that survives encode must
	// survive parse byte for byte.
	const nasty = [
		['slug', 'name', 'bio', 'schedule'],
		['rizky-plays', 'Rizky "The Goat" Plays', 'Main tiap malam, kadang siang', '{"a":1}'],
		['nova-squad', 'Nova, Squad', 'Line one\nLine two', '{"b":[1,2]}'],
		['empty-guy', '', '', ''],
		['unicode', 'Pokémon UNITE 日本語', 'emoji free', '{}'],
	];

	it('survives encode then parse unchanged', () =>
		assert.deepEqual(parseCsv(encodeCsv(nasty)), nasty));
});

describe('parseCsvRecords', () => {
	const csv = 'slug,name\r\nrizky-plays,Rizky\r\nnova-squad,Nova';

	it('keys rows by header', () =>
		assert.deepEqual(parseCsvRecords(csv), [
			{ slug: 'rizky-plays', name: 'Rizky' },
			{ slug: 'nova-squad', name: 'Nova' },
		]));

	it('fills missing trailing columns with empty strings', () =>
		assert.deepEqual(parseCsvRecords('a,b,c\r\n1,2'), [{ a: '1', b: '2', c: '' }]));

	it('ignores a blank trailing line', () =>
		assert.equal(parseCsvRecords('slug,name\r\nx,y\r\n').length, 1));

	it('returns nothing for an empty file', () => assert.deepEqual(parseCsvRecords(''), []));
});
