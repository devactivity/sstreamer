/**
 * Retrying fetch for the sync job.
 *
 * Google's APIs return 503 UNAVAILABLE, and occasionally 429 or 500, with nothing wrong
 * at either end. A single-shot request turns that momentary blip into a failed workflow
 * run and an email, even though the next run fifteen minutes later succeeds and nothing
 * was ever lost.
 *
 * Kept out of sync-sheet.mjs so it can be tested against a stubbed fetch: retry code
 * that has never been exercised is how a "retry" that only ever tries once ships.
 *
 * Deliberately does NOT call process.exit. Callers decide what a give-up means, because
 * the same helper is used for the token request and the sheet read.
 */

/**
 * Worth trying again. Everything else - 401, 403, 404 - means the credentials, the sheet
 * id, or the sharing is wrong, and repeating the request just delays a real error you
 * need to read.
 */
export const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class HttpError extends Error {
	constructor(message, { status, body, attempts }) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
		this.body = body;
		this.attempts = attempts;
	}
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exponential with jitter. The jitter matters less here than in a busy service, but a
 * fixed delay is the one shape guaranteed to line up with whatever rhythm made the
 * upstream fail in the first place.
 */
function backoffMs(attempt, base) {
	return Math.round(base * 2 ** (attempt - 1) * (0.5 + Math.random()));
}

/** Honour Retry-After when the server states one, since it knows better than we do. */
function retryAfterMs(response) {
	const header = response.headers?.get?.('retry-after');
	if (!header) return undefined;

	const seconds = Number(header);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

	const date = Date.parse(header);
	return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/**
 * Fetch, retrying transient failures. Resolves with the Response on success; throws
 * HttpError when the last attempt fails or the status is not worth retrying.
 *
 * `label` appears in the messages, so a failure says which of the two calls broke.
 */
export async function fetchWithRetry(label, url, options = {}, config = {}) {
	const {
		attempts = 4,
		baseDelayMs = 1000,
		fetchImpl = fetch,
		sleep = wait,
		onRetry = () => {},
	} = config;

	for (let attempt = 1; ; attempt++) {
		const last = attempt >= attempts;

		let response;
		try {
			response = await fetchImpl(url, options);
		} catch (err) {
			// DNS failures, resets, timeouts: no status to inspect, always worth retrying.
			if (last) {
				throw new HttpError(`${label} failed after ${attempt} attempt(s): ${err.message}`, {
					attempts: attempt,
				});
			}
			const delay = backoffMs(attempt, baseDelayMs);
			onRetry({ label, attempt, attempts, delay, reason: err.message });
			await sleep(delay);
			continue;
		}

		if (response.ok) return response;

		// Read once: a Response body cannot be consumed twice, and the body is where
		// Google explains what was actually wrong.
		const body = await response.text();

		if (!RETRY_STATUSES.has(response.status) || last) {
			const suffix = last && RETRY_STATUSES.has(response.status) ? ` after ${attempt} attempts` : '';
			throw new HttpError(`${label} failed${suffix}: ${response.status} ${body}`, {
				status: response.status,
				body,
				attempts: attempt,
			});
		}

		const delay = retryAfterMs(response) ?? backoffMs(attempt, baseDelayMs);
		onRetry({ label, attempt, attempts, delay, reason: String(response.status) });
		await sleep(delay);
	}
}
