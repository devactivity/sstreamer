import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWindows, liveWindow, nextWindow } from '../src/lib/live-client.ts';

/** The exact format Directory.astro and GameProfile.astro emit into data-occ. */
const ATTR = '1786712400000,1786723200000|1786777200000,1786784400000';

describe('parseWindows', () => {
	it('parses the emitted data-occ format', () => {
		assert.deepEqual(parseWindows(ATTR), [
			{ start: 1786712400000, end: 1786723200000 },
			{ start: 1786777200000, end: 1786784400000 },
		]);
	});

	it('handles a single window', () =>
		assert.deepEqual(parseWindows('100,200'), [{ start: 100, end: 200 }]));

	it('returns empty for a bare profile with no schedule', () => {
		assert.deepEqual(parseWindows(''), []);
		assert.deepEqual(parseWindows(undefined), []);
		assert.deepEqual(parseWindows(null), []);
	});

	it('drops malformed pairs rather than producing NaN windows', () =>
		assert.deepEqual(parseWindows('100,200|broken|300,400'), [
			{ start: 100, end: 200 },
			{ start: 300, end: 400 },
		]));
});

describe('liveWindow', () => {
	const windows = parseWindows(ATTR);

	it('finds the window running now', () =>
		assert.deepEqual(liveWindow(windows, 1786715000000), {
			start: 1786712400000,
			end: 1786723200000,
		}));

	it('counts the exact start as live', () => assert.ok(liveWindow(windows, 1786712400000)));

	it('is not live at the exact end', () =>
		assert.equal(liveWindow(windows, 1786723200000), undefined));

	it('is not live in the gap between windows', () =>
		assert.equal(liveWindow(windows, 1786750000000), undefined));

	it('is not live before anything starts', () =>
		assert.equal(liveWindow(windows, 1786000000000), undefined));

	it('handles an empty window list', () => assert.equal(liveWindow([], Date.now()), undefined));
});

describe('nextWindow', () => {
	const windows = parseWindows(ATTR);

	it('skips the window currently running', () =>
		assert.equal(nextWindow(windows, 1786715000000)?.start, 1786777200000));

	it('returns the first window when nothing has started', () =>
		assert.equal(nextWindow(windows, 1786000000000)?.start, 1786712400000));

	it('returns undefined once everything has started', () =>
		assert.equal(nextWindow(windows, 1786800000000), undefined));

	it('handles an empty window list', () => assert.equal(nextWindow([], Date.now()), undefined));
});
