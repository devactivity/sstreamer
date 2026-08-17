/**
 * One-time migration: replace the published `edit_key_hash` in every streamer file
 * with a peppered `edit_key_mac`.
 *
 * Why this is needed: the browser authenticates an edit by sending the SHA-256 of the
 * streamer's key, and the sync used to compare that against the same hash stored in the
 * repo. The repo is public, so the value that passes the check was readable by anyone.
 * Storing an HMAC under a secret pepper instead means the published value is no longer
 * the one that gets submitted.
 *
 * Safe to run twice. A file that already has `edit_key_mac` is left alone, and the two
 * fields have different names precisely so a peppered value can never be peppered
 * again, which would lock the streamer out with no way back.
 *
 * Usage, with the same pepper you put in the EDIT_KEY_PEPPER Actions secret:
 *
 *   EDIT_KEY_PEPPER='...' node scripts/pepper-edit-keys.mjs --dry-run
 *   EDIT_KEY_PEPPER='...' node scripts/pepper-edit-keys.mjs
 *
 * If the pepper is ever lost, the submissions sheet still holds every raw hash that was
 * ever submitted. Recovery is a new pepper plus rebuilding the MACs from that sheet,
 * not a lockout - but it is manual, so keep a copy of the pepper somewhere safe.
 */
import { writeFileSync } from 'node:fs';
import { readStreamers, toYaml, normaliseDates } from './lib/streamer-io.mjs';
import { editKeyMac } from './lib/sync-rules.mjs';

const dryRun = process.argv.includes('--dry-run');

const pepper = process.env.EDIT_KEY_PEPPER;
if (!pepper) {
	console.error('EDIT_KEY_PEPPER is not set. Use the same value as the Actions secret.');
	process.exit(1);
}

let migrated = 0;
let already = 0;
let none = 0;

for (const { slug, file, data } of readStreamers()) {
	if (data.edit_key_mac) {
		already++;
		console.log(`  = ${slug}: already peppered`);
		continue;
	}

	if (!data.edit_key_hash) {
		none++;
		console.log(`  . ${slug}: no key on record, nothing to migrate`);
		continue;
	}

	const { edit_key_hash, ...rest } = data;
	const next = { ...rest, edit_key_mac: editKeyMac(pepper, edit_key_hash) };

	if (!dryRun) writeFileSync(file, toYaml(normaliseDates(next)));
	migrated++;
	console.log(`  ~ ${slug}: edit_key_hash -> edit_key_mac`);
}

console.log(
	`\n${migrated} migrated, ${already} already done, ${none} without a key` +
		(dryRun ? '\n\ndry run, nothing written.' : ''),
);

if (migrated > 0 && !dryRun) {
	console.log('\nCommit these files, and make sure EDIT_KEY_PEPPER is set as an Actions');
	console.log('secret with the same value before the next sync runs.');
}
