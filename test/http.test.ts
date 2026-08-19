import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, RETRY_STATUSES, fetchWithRetry } from '../scripts/lib/http.mjs';

/** Minimal stand-in for a Response: only what fetchWithRetry actually touches. */
const reply = (status: number, body = '', headers: Record<string, string> = {}) => ({
	ok: status >= 200 && status < 300,
	status,
	text: async () => body,
	json: async () => JSON.parse(body || '{}'),
	headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
});

/**
 * Drives the helper without waiting. Records what it was asked to sleep for, so the
 * backoff can be asserted rather than merely assumed to exist.
 */
function harness(steps: (unknown | Error)[]) {
	const delays: number[] = [];
	const retries: { attempt: number; reason: string }[] = [];
	let calls = 0;

	const config = {
		fetchImpl: async () => {
			const step = steps[Math.min(calls++, steps.length - 1)];
			if (step instanceof Error) throw step;
			return step;
		},
		sleep: async (ms: number) => {
			delays.push(ms);
		},
		onRetry: ({ attempt, reason }: { attempt: number; reason: string }) => {
			retries.push({ attempt, reason });
		},
	};

	return { config, delays, retries, calls: () => calls };
}

describe('fetchWithRetry', () => {
	it('returns the response without retrying when the first call succeeds', async () => {
		const h = harness([reply(200, '{"ok":true}')]);
		const res = await fetchWithRetry('sheet read', 'https://x', {}, h.config);
		assert.equal(res.status, 200);
		assert.equal(h.calls(), 1);
		assert.deepEqual(h.delays, []);
	});

	/** The actual failure seen in production: one 503, then fine. */
	it('recovers from a single 503', async () => {
		const h = harness([reply(503, 'unavailable'), reply(200, '{"values":[]}')]);
		const res = await fetchWithRetry('sheet read', 'https://x', {}, h.config);
		assert.equal(res.status, 200);
		assert.equal(h.calls(), 2);
		assert.deepEqual(
			h.retries.map((r) => r.reason),
			['503'],
		);
	});

	it('retries every status worth retrying', async () => {
		for (const status of RETRY_STATUSES) {
			const h = harness([reply(status, 'nope'), reply(200, '{}')]);
			await fetchWithRetry('sheet read', 'https://x', {}, h.config);
			assert.equal(h.calls(), 2, `status ${status} should have been retried`);
		}
	});

	/**
	 * The important half. A 403 means the sheet is not shared with the service account
	 * and a 404 means the id is wrong; repeating those just delays an error you need to
	 * read, and hides it behind a slower run.
	 */
	it('does not retry a permanent failure', async () => {
		for (const status of [400, 401, 403, 404]) {
			const h = harness([reply(status, 'denied')]);
			await assert.rejects(
				() => fetchWithRetry('sheet read', 'https://x', {}, h.config),
				(err: HttpError) => {
					assert.equal(err.status, status);
					assert.equal(err.attempts, 1);
					assert.match(err.message, /denied/);
					return true;
				},
			);
			assert.equal(h.calls(), 1, `status ${status} should not have been retried`);
		}
	});

	it('gives up after the configured number of attempts', async () => {
		const h = harness([reply(503, 'still down')]);
		await assert.rejects(
			() => fetchWithRetry('sheet read', 'https://x', {}, { ...h.config, attempts: 4 }),
			(err: HttpError) => {
				assert.equal(err.attempts, 4);
				assert.match(err.message, /after 4 attempts: 503 still down/);
				return true;
			},
		);
		assert.equal(h.calls(), 4);
		assert.equal(h.delays.length, 3, 'three waits between four attempts');
	});

	it('retries a thrown network error, which has no status to inspect', async () => {
		const h = harness([new Error('ECONNRESET'), reply(200, '{}')]);
		const res = await fetchWithRetry('token request', 'https://x', {}, h.config);
		assert.equal(res.status, 200);
		assert.deepEqual(
			h.retries.map((r) => r.reason),
			['ECONNRESET'],
		);
	});

	it('reports the label so a failure says which call broke', async () => {
		const h = harness([reply(500, 'boom')]);
		await assert.rejects(
			() => fetchWithRetry('token request', 'https://x', {}, { ...h.config, attempts: 1 }),
			/^HttpError: token request failed/,
		);
	});

	it('backs off further each time', async () => {
		const h = harness([reply(503, 'x')]);
		await assert.rejects(() =>
			fetchWithRetry('sheet read', 'https://x', {}, { ...h.config, attempts: 4, baseDelayMs: 1000 }),
		);
		// Jittered to between half and one and a half of the nominal 1s, 2s, 4s.
		const [first, second, third] = h.delays;
		assert.ok(first >= 500 && first <= 1500, `first ${first}`);
		assert.ok(second >= 1000 && second <= 3000, `second ${second}`);
		assert.ok(third >= 2000 && third <= 6000, `third ${third}`);
	});

	it('honours Retry-After given in seconds', async () => {
		const h = harness([reply(429, 'slow down', { 'retry-after': '7' }), reply(200, '{}')]);
		await fetchWithRetry('sheet read', 'https://x', {}, h.config);
		assert.deepEqual(h.delays, [7000]);
	});

	it('honours Retry-After given as a date', async () => {
		const when = new Date(Date.now() + 5000).toUTCString();
		const h = harness([reply(429, 'slow down', { 'retry-after': when }), reply(200, '{}')]);
		await fetchWithRetry('sheet read', 'https://x', {}, h.config);
		assert.ok(h.delays[0] > 3000 && h.delays[0] <= 5000, `delay ${h.delays[0]}`);
	});

	it('ignores an unparseable Retry-After rather than waiting forever', async () => {
		const h = harness([reply(503, 'x', { 'retry-after': 'soon' }), reply(200, '{}')]);
		await fetchWithRetry('sheet read', 'https://x', {}, h.config);
		assert.ok(Number.isFinite(h.delays[0]));
		assert.ok(h.delays[0] > 0);
	});

	it('never waits after the final attempt', async () => {
		const h = harness([reply(503, 'x')]);
		await assert.rejects(() =>
			fetchWithRetry('sheet read', 'https://x', {}, { ...h.config, attempts: 2 }),
		);
		assert.equal(h.delays.length, 1);
	});
});
