import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_CHANNELS, decodeChannels, encodeChannels } from '../src/lib/channel-encode.ts';

describe('encodeChannels', () => {
	it('packs one channel', () =>
		assert.equal(encodeChannels([{ platform: 'youtube', handle: '@hurizz' }]), 'youtube|@hurizz'));

	it('packs several', () =>
		assert.equal(
			encodeChannels([
				{ platform: 'youtube', handle: '@hurizz' },
				{ platform: 'twitch', handle: 'hurizzlive' },
			]),
			'youtube|@hurizz;twitch|hurizzlive',
		));

	it('returns an empty string for no channels', () => assert.equal(encodeChannels([]), ''));

	it('trims the handle', () =>
		assert.equal(encodeChannels([{ platform: 'tiktok', handle: '  hurizz  ' }]), 'tiktok|hurizz'));

	// An empty handle is how the form says "drop this channel", so it must not encode.
	it('drops a channel with no handle', () =>
		assert.equal(encodeChannels([{ platform: 'tiktok', handle: '   ' }]), ''));

	it('drops a platform outside the known list', () =>
		assert.equal(encodeChannels([{ platform: 'kick', handle: 'someone' }]), ''));

	/**
	 * A handle carrying a separator would decode as a different value than it went in
	 * as, which means publishing a link to an account nobody asked for. Dropping it
	 * loses one channel; encoding it anyway would be wrong quietly.
	 */
	it('drops a handle containing a separator', () => {
		assert.equal(encodeChannels([{ platform: 'tiktok', handle: 'a|b' }]), '');
		assert.equal(encodeChannels([{ platform: 'tiktok', handle: 'a;b' }]), '');
	});
});

describe('decodeChannels', () => {
	it('reads one channel', () =>
		assert.deepEqual(decodeChannels('youtube|@hurizz'), [
			{ platform: 'youtube', handle: '@hurizz' },
		]));

	it('reads several', () =>
		assert.deepEqual(decodeChannels('youtube|@hurizz;twitch|hurizzlive'), [
			{ platform: 'youtube', handle: '@hurizz' },
			{ platform: 'twitch', handle: 'hurizzlive' },
		]));

	it('returns nothing for empty input', () => {
		for (const empty of ['', '   ', undefined, null]) {
			assert.deepEqual(decodeChannels(empty), []);
		}
	});

	it('survives a round trip', () => {
		const channels = [
			{ platform: 'youtube', handle: '@hurizz' },
			{ platform: 'facebook', handle: 'hurizz.gaming' },
		];
		assert.deepEqual(decodeChannels(encodeChannels(channels)), channels);
	});

	it('tolerates whitespace around the fields', () =>
		assert.deepEqual(decodeChannels(' youtube | @hurizz ; twitch | live '), [
			{ platform: 'youtube', handle: '@hurizz' },
			{ platform: 'twitch', handle: 'live' },
		]));

	it('accepts a platform in any case', () =>
		assert.deepEqual(decodeChannels('YouTube|@hurizz'), [
			{ platform: 'youtube', handle: '@hurizz' },
		]));

	it('drops a platform outside the known list', () =>
		assert.deepEqual(decodeChannels('kick|someone;youtube|@ok'), [
			{ platform: 'youtube', handle: '@ok' },
		]));

	it('drops an entry with no handle', () =>
		assert.deepEqual(decodeChannels('youtube|;twitch|ok'), [
			{ platform: 'twitch', handle: 'ok' },
		]));

	// Anything but exactly two fields means a separator ended up inside a value, so the
	// entry is not what whoever wrote it thought it was.
	it('drops a malformed entry rather than guessing at it', () => {
		assert.deepEqual(decodeChannels('youtube'), []);
		assert.deepEqual(decodeChannels('youtube|a|b'), []);
	});

	it('drops an exact duplicate, which would render as two identical links', () =>
		assert.deepEqual(decodeChannels('youtube|@hurizz;youtube|@HURIZZ'), [
			{ platform: 'youtube', handle: '@hurizz' },
		]));

	// Two accounts on one platform is ordinary, so only exact repeats are dropped.
	it('keeps two different handles on the same platform', () =>
		assert.equal(decodeChannels('youtube|@main;youtube|@clips').length, 2));

	it('caps how many channels one cell can become', () => {
		const many = Array.from({ length: MAX_CHANNELS + 5 }, (_, i) => `youtube|@a${i}`).join(';');
		assert.equal(decodeChannels(many).length, MAX_CHANNELS);
	});

	it('ignores junk without throwing', () => {
		for (const junk of ['|||', ';;;', 'youtube|', '|@hurizz', 'x']) {
			assert.doesNotThrow(() => decodeChannels(junk));
		}
	});
});
