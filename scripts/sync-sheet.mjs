#!/usr/bin/env node
/**
 * Pull streamer submissions from a private Google Sheet into YAML.
 *
 *   node scripts/sync-sheet.mjs --dry-run
 *   node scripts/sync-sheet.mjs
 *
 * Environment:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  the full service account JSON (a GitHub secret)
 *   SHEET_ID                     the spreadsheet id from its URL
 *   SHEET_RANGE                  optional, defaults to "Submissions!A:Z"
 *
 * The sheet must stay private. Publish-to-web would expose the edit key hashes,
 * and a published hash can be replayed to impersonate a streamer.
 *
 * No dependencies: the service account JWT is signed with node:crypto and the
 * Sheets REST API is called with fetch.
 */
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	STREAMER_DIR,
	ensureStreamerDir,
	readStreamers,
	readGameSlugs,
	toYaml,
	normaliseDates,
} from './lib/streamer-io.mjs';
import {
	applyPatch,
	decideSubmission,
	slugify,
	submissionToPatch,
} from './lib/sync-rules.mjs';

const dryRun = process.argv.includes('--dry-run');
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

function fail(message) {
	console.error(`sync-sheet: ${message}`);
	process.exit(1);
}

function loadCredentials() {
	let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

	// Locally it's easier (and safer) to point at the downloaded key file than to
	// paste its contents into a shell. CI uses the inline secret instead.
	if (!raw && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
		try {
			raw = readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
		} catch (err) {
			fail(`could not read GOOGLE_APPLICATION_CREDENTIALS: ${err.message}`);
		}
	}

	if (!raw) {
		fail('set GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS to a key file');
	}
	let creds;
	try {
		creds = JSON.parse(raw);
	} catch (err) {
		fail(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (${err.message})`);
	}
	if (!creds.client_email || !creds.private_key) {
		fail('service account JSON is missing client_email or private_key');
	}
	// Secrets pasted through a UI often arrive with escaped newlines.
	creds.private_key = creds.private_key.replace(/\\n/g, '\n');
	return creds;
}

function signJwt({ client_email, private_key }) {
	const now = Math.floor(Date.now() / 1000);
	const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
	const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
		iss: client_email,
		scope: SCOPE,
		aud: 'https://oauth2.googleapis.com/token',
		iat: now,
		exp: now + 3600,
	})}`;

	// A mangled private_key is the most likely setup mistake - truncated paste,
	// or newlines that never got unescaped. Node throws a raw crypto error for
	// that, which tells you nothing about what to fix.
	try {
		const signature = createSign('RSA-SHA256').update(input).sign(private_key, 'base64url');
		return `${input}.${signature}`;
	} catch (err) {
		fail(
			`could not sign with the service account private key (${err.message}).\n` +
				'  Check private_key is the complete value from the downloaded JSON, ' +
				'including the BEGIN/END lines.',
		);
	}
}

async function getAccessToken(creds) {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: signJwt(creds),
		}),
	});
	if (!res.ok) fail(`token request failed: ${res.status} ${await res.text()}`);
	const { access_token } = await res.json();
	if (!access_token) fail('token response had no access_token');
	return access_token;
}

async function fetchRows(token, sheetId, range) {
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
		sheetId,
	)}/values/${encodeURIComponent(range)}`;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) fail(`sheet read failed: ${res.status} ${await res.text()}`);
	const { values = [] } = await res.json();
	if (values.length < 2) return [];

	// Normalise headers so "Edit Key Hash" and "edit_key_hash" both work.
	const header = values[0].map((h) =>
		String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
	);
	return values.slice(1).map((row) => {
		const record = {};
		header.forEach((key, i) => {
			record[key] = row[i] ?? '';
		});
		return record;
	});
}

const creds = loadCredentials();
const sheetId = process.env.SHEET_ID || fail('SHEET_ID is not set');
const range = process.env.SHEET_RANGE || 'Submissions!A:Z';

const token = await getAccessToken(creds);
const rows = await fetchRows(token, sheetId, range);
console.log(`read ${rows.length} submission row(s) from ${range}`);

// Latest state per slug, so several submissions in one run apply in order.
const current = new Map(readStreamers().map((s) => [s.slug, s.data]));

// Read once rather than per row. A submission naming a game with no file would fail
// the schema, and the build step below turns that into a failed run for everybody.
const knownGames = readGameSlugs();

/**
 * Secret behind the stored edit key MACs. Fatal when missing rather than degraded:
 * without it no key can be verified, so every edit would silently start queueing and
 * every new profile would be created with no key on record at all - which looks like
 * the sync working right up until nobody can edit anything.
 */
const pepper = process.env.EDIT_KEY_PEPPER || fail('EDIT_KEY_PEPPER is not set');
const today = new Date().toISOString().slice(0, 10);
const writes = new Map();
const queued = [];
const avatarRequests = [];
let skipped = 0;

for (const [i, row] of rows.entries()) {
	const line = i + 2;
	const slug = (row.slug || '').trim() || slugify(row.name);
	if (!slug) {
		queued.push({ line, slug: '(none)', reason: 'no slug or name' });
		continue;
	}

	const existing = writes.get(slug) ?? current.get(slug) ?? null;
	const patch = submissionToPatch(row, pepper);
	const { action, reason, changed, avatarRequest } = decideSubmission({
		row,
		existing,
		patch,
		knownGames,
		pepper,
	});

	// Collected before the action is handled, so a row whose only content is a picture
	// request still reports rather than vanishing into the `skip` count.
	if (avatarRequest) {
		avatarRequests.push({ line, slug, url: avatarRequest, has: Boolean(existing?.avatar) });
	}

	if (action === 'skip') {
		skipped++;
		continue;
	}
	if (action === 'queue') {
		queued.push({ line, slug, reason, changed });
		continue;
	}

	writes.set(slug, applyPatch(existing, patch, today));
	console.log(`  ${action === 'create' ? '+' : '~'} ${slug}: ${reason} [${changed.join(', ')}]`);
}

console.log(
	`\n${writes.size} to write, ${queued.length} queued for review, ${skipped} unchanged`,
);

if (queued.length > 0) {
	console.log('\nneeds your review in the sheet (tick `approved` to let it through):');
	for (const q of queued) console.log(`  line ${q.line} ${q.slug}: ${q.reason}`);
}

// Never applied automatically. `avatar` is a repo-relative path Astro resolves at
// build time, so saving the file and pointing at it is a commit, not a sheet tick.
if (avatarRequests.length > 0) {
	console.log('\npictures requested (save by hand, then delete the sheet row):');
	for (const a of avatarRequests) {
		console.log(`  line ${a.line} ${a.slug}${a.has ? ' (replacing existing)' : ''}: ${a.url}`);
	}
}

if (dryRun) {
	console.log('\ndry run, nothing written.');
	process.exit(0);
}

if (writes.size > 0) ensureStreamerDir();
for (const [slug, data] of writes) {
	writeFileSync(path.join(STREAMER_DIR, `${slug}.yaml`), toYaml(normaliseDates(data)));
}

console.log(`\nwrote ${writes.size} file(s).`);
