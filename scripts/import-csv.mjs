#!/usr/bin/env node
/**
 * Restore streamers from a CSV produced by export-csv.mjs.
 *
 *   node scripts/import-csv.mjs backup.csv           # dry run, prints a diff
 *   node scripts/import-csv.mjs backup.csv --force   # actually write
 *   node scripts/import-csv.mjs backup.csv --force --prune   # also delete extras
 *
 * This is the one genuinely destructive operation in the project: it overwrites the
 * only copy of the data. So it is a dry run by default, validates every row before
 * writing any of them, and never deletes without --prune.
 *
 * Note that YAML comments are not preserved - a restore rewrites the files.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseCsvRecords } from '../src/lib/csv.ts';
import {
	STREAMER_DIR,
	ensureStreamerDir,
	fingerprint,
	fromRecord,
	readStreamers,
	toYaml,
} from './lib/streamer-io.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const force = args.includes('--force');
const prune = args.includes('--prune');

if (!file) {
	console.error('usage: node scripts/import-csv.mjs <file.csv> [--force] [--prune]');
	process.exit(2);
}

const records = parseCsvRecords(readFileSync(file, 'utf8'));
if (records.length === 0) {
	console.error('refusing to import: the CSV has no data rows');
	process.exit(2);
}

// Validate everything up front. A half-applied import is worse than no import.
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const errors = [];
const parsed = [];

for (const [i, record] of records.entries()) {
	const line = i + 2; // header is line 1
	const slug = (record.slug ?? '').trim();

	if (!SLUG.test(slug)) {
		// Also stops a crafted slug escaping the data directory.
		errors.push(`line ${line}: invalid slug ${JSON.stringify(slug)}`);
		continue;
	}
	if (!(record.name ?? '').trim()) {
		errors.push(`line ${line}: name is required`);
		continue;
	}

	try {
		parsed.push({ slug, data: fromRecord(record) });
	} catch (err) {
		errors.push(`line ${line} (${slug}): ${err.message}`);
	}
}

const seen = new Set();
for (const { slug } of parsed) {
	if (seen.has(slug)) errors.push(`duplicate slug: ${slug}`);
	seen.add(slug);
}

if (errors.length > 0) {
	console.error(`refusing to import, ${errors.length} problem(s):\n`);
	for (const e of errors) console.error(`  ${e}`);
	process.exit(1);
}

const existing = new Map(readStreamers().map((s) => [s.slug, s]));
const created = [];
const changed = [];
const unchanged = [];

for (const entry of parsed) {
	const current = existing.get(entry.slug);
	if (!current) created.push(entry);
	else if (fingerprint(current.data) !== JSON.stringify(entry.data)) changed.push(entry);
	else unchanged.push(entry);
}

const orphaned = [...existing.keys()].filter((slug) => !seen.has(slug));

console.log(`create    ${created.length}`);
for (const e of created) console.log(`  + ${e.slug}`);
console.log(`update    ${changed.length}`);
for (const e of changed) console.log(`  ~ ${e.slug}`);
console.log(`unchanged ${unchanged.length}`);
console.log(`not in CSV ${orphaned.length}${prune ? ' (will be deleted)' : ' (kept)'}`);
for (const slug of orphaned) console.log(`  ${prune ? '-' : '?'} ${slug}`);

if (!force) {
	console.log('\ndry run. re-run with --force to apply.');
	process.exit(0);
}

const writes = [...created, ...changed];
if (writes.length > 0) ensureStreamerDir();
for (const entry of writes) {
	writeFileSync(path.join(STREAMER_DIR, `${entry.slug}.yaml`), toYaml(entry.data));
}

if (prune) {
	for (const slug of orphaned) unlinkSync(existing.get(slug).file);
}

console.log(
	`\napplied: ${created.length} created, ${changed.length} updated` +
		(prune ? `, ${orphaned.length} deleted` : ''),
);
