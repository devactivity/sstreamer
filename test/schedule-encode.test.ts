import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	DEFAULT_DURATION,
	MAX_BLOCKS,
	decodeBlocks,
	encodeBlocks,
} from '../src/lib/schedule-encode.ts';

describe('encodeBlocks', () => {
	it('packs one block', () => {
		assert.equal(
			encodeBlocks([{ game: 'valorant', days: ['sat', 'sun'], start: '12:00', duration_min: 180 }]),
			'valorant|sat,sun|12:00|180',
		);
	});

	it('joins several blocks', () => {
		assert.equal(
			encodeBlocks([
				{ game: 'valorant', days: ['mon'], start: '20:00', duration_min: 120 },
				{ game: 'genshin-impact', days: ['fri'], start: '21:00', duration_min: 90 },
			]),
			'valorant|mon|20:00|120;genshin-impact|fri|21:00|90',
		);
	});

	it('sorts days into week order, so the same schedule always encodes the same way', () => {
		assert.equal(
			encodeBlocks([{ game: 'x', days: ['sun', 'mon', 'sat'], start: '10:00', duration_min: 60 }]),
			'x|mon,sat,sun|10:00|60',
		);
	});

	it('drops blocks that could never be a schedule', () => {
		assert.equal(
			encodeBlocks([
				{ game: 'a', days: [], start: '10:00', duration_min: 60 },
				{ game: 'b', days: ['mon'], start: 'nonsense', duration_min: 60 },
			]),
			'',
		);
	});

	it('tolerates a block with no game', () => {
		assert.equal(
			encodeBlocks([{ game: '', days: ['mon'], start: '20:00', duration_min: 120 }]),
			'|mon|20:00|120',
		);
	});
});

describe('decodeBlocks', () => {
	it('round-trips what encodeBlocks produced', () => {
		const blocks = [
			{ game: 'valorant', days: ['sat', 'sun'], start: '12:00', duration_min: 180 },
			{ game: 'genshin-impact', days: ['fri'], start: '21:00', duration_min: 90 },
		];
		assert.deepEqual(decodeBlocks(encodeBlocks(blocks)), blocks);
	});

	it('treats blank, null and undefined as no blocks', () => {
		assert.deepEqual(decodeBlocks(''), []);
		assert.deepEqual(decodeBlocks(null), []);
		assert.deepEqual(decodeBlocks(undefined), []);
		assert.deepEqual(decodeBlocks('  ;  ;'), []);
	});

	it('ignores surrounding whitespace, as a spreadsheet cell will have it', () => {
		assert.deepEqual(decodeBlocks('  valorant | sat , sun | 12:00 | 180  '), [
			{ game: 'valorant', days: ['sat', 'sun'], start: '12:00', duration_min: 180 },
		]);
	});

	it('lowercases day names', () => {
		assert.deepEqual(decodeBlocks('x|MON,Tue|09:00|60')[0].days, ['mon', 'tue']);
	});

	it('de-duplicates days, which would otherwise be two streams at one instant', () => {
		assert.deepEqual(decodeBlocks('x|mon,mon,tue|09:00|60')[0].days, ['mon', 'tue']);
	});

	// Anything here came out of a public form, so one bad value must not take the whole
	// sync down with it. Bad blocks are skipped and good ones still land.
	it('skips a malformed block without losing the good ones', () => {
		assert.deepEqual(decodeBlocks('valorant|notaday|12:00|180;x|mon|09:00|60'), [
			{ game: 'x', days: ['mon'], start: '09:00', duration_min: 60 },
		]);
	});

	it('rejects out-of-range and malformed times', () => {
		assert.deepEqual(decodeBlocks('x|mon|24:00|60'), []);
		assert.deepEqual(decodeBlocks('x|mon|9:00|60'), []);
		assert.deepEqual(decodeBlocks('x|mon|12:60|60'), []);
		assert.deepEqual(decodeBlocks('x|mon||60'), []);
	});

	it('falls back to the default duration rather than dropping the block', () => {
		for (const bad of ['', 'abc', '0', '-30', '99999', '1.5']) {
			const [block] = decodeBlocks(`x|mon|09:00|${bad}`);
			assert.equal(block?.duration_min, DEFAULT_DURATION, `duration "${bad}"`);
		}
	});

	it('keeps a duration at the 1440 minute boundary', () => {
		assert.equal(decodeBlocks('x|mon|09:00|1440')[0].duration_min, 1440);
		assert.equal(decodeBlocks('x|mon|09:00|1441')[0].duration_min, DEFAULT_DURATION);
	});

	it('caps how many blocks one cell can become', () => {
		const many = Array.from({ length: MAX_BLOCKS + 5 }, () => 'x|mon|09:00|60').join(';');
		assert.equal(decodeBlocks(many).length, MAX_BLOCKS);
	});
});
