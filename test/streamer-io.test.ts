import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
	ensureStreamerDir,
	listStreamerFiles,
	readStreamers,
} from '../scripts/lib/streamer-io.mjs';

const root = path.join(tmpdir(), `streamer-io-test-${process.pid}`);
after(() => rmSync(root, { recursive: true, force: true }));

const fresh = (name: string) => path.join(root, name);

describe('listStreamerFiles', () => {
	// Regression: git does not track empty directories, so a repo whose streamers
	// have all been removed checks out without the directory at all. This threw
	// ENOENT and killed the sync before it could write the first approved profile.
	it('treats a missing directory as no streamers', () => {
		const dir = fresh('never-created');
		assert.equal(existsSync(dir), false);
		assert.deepEqual(listStreamerFiles(dir), []);
		assert.deepEqual(readStreamers(dir), []);
	});

	it('still throws on errors that are not a missing directory', () => {
		const file = fresh('a-file-not-a-dir');
		mkdirSync(root, { recursive: true });
		writeFileSync(file, 'not a directory');
		assert.throws(() => listStreamerFiles(file), { code: 'ENOTDIR' });
	});

	it('lists only YAML, sorted', () => {
		const dir = fresh('populated');
		mkdirSync(dir, { recursive: true });
		for (const f of ['b.yaml', 'a.yml', 'notes.txt', 'c.yaml']) {
			writeFileSync(path.join(dir, f), 'name: x\n');
		}
		assert.deepEqual(listStreamerFiles(dir), ['a.yml', 'b.yaml', 'c.yaml']);
	});
});

describe('ensureStreamerDir', () => {
	it('creates the directory, including missing parents', () => {
		const dir = fresh('nested/deeper/streamers');
		ensureStreamerDir(dir);
		assert.equal(existsSync(dir), true);
	});

	it('is a no-op when the directory already exists', () => {
		const dir = fresh('already-there');
		ensureStreamerDir(dir);
		writeFileSync(path.join(dir, 'keep.yaml'), 'name: kept\n');
		ensureStreamerDir(dir);
		assert.deepEqual(listStreamerFiles(dir), ['keep.yaml']);
	});
});
