#!/usr/bin/env node
/**
 * Export every streamer to CSV.
 *
 *   node scripts/export-csv.mjs                  # admin dump to stdout
 *   node scripts/export-csv.mjs --out backup.csv # admin dump to a file
 *   node scripts/export-csv.mjs --public         # omit the edit key hashes
 *
 * Note this is for bulk editing and portability. For disaster recovery, git already
 * holds every version of every profile with full history.
 */
import { writeFileSync } from 'node:fs';
import { encodeCsv } from '../src/lib/csv.ts';
import { COLUMNS, PUBLIC_COLUMNS, readStreamers, toRecord } from './lib/streamer-io.mjs';

const args = process.argv.slice(2);
const isPublic = args.includes('--public');
const outIdx = args.indexOf('--out');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

const columns = isPublic ? PUBLIC_COLUMNS : COLUMNS;
const streamers = readStreamers();
const rows = [columns, ...streamers.map((s) => columns.map((c) => toRecord(s)[c] ?? ''))];
const csv = encodeCsv(rows);

if (outFile) {
	writeFileSync(outFile, csv);
	console.error(
		`exported ${streamers.length} streamers to ${outFile}${isPublic ? ' (public columns)' : ''}`,
	);
} else {
	process.stdout.write(csv + '\n');
}
