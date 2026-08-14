/**
 * Edit keys let a streamer update their own profile without an account.
 *
 * The security model, stated plainly:
 *
 *  - The key is generated in the browser and shown once. It is never transmitted.
 *  - Only the SHA-256 hash travels to the sheet and gets stored in the repo.
 *  - Verification happens in the sync Action, not in the browser. A browser-side
 *    check would be decoration: anyone can POST straight to the form endpoint.
 *  - The repo is public, so the stored hash is public. 128 bits of entropy is what
 *    makes that safe. Shortening the key breaks the whole scheme.
 *
 * There is no recovery path by design. A lost key means manual moderation.
 */

const KEY_BYTES = 16; // 128 bits

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh key, grouped into blocks so it can be read off a screen and retyped. */
export function generateEditKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
	return (toHex(bytes).match(/.{1,4}/g) ?? []).join('-').toUpperCase();
}

/**
 * Strip formatting before hashing so a key retyped without dashes, or in the wrong
 * case, still matches. Anything non-hex is punctuation the user added or kept.
 */
export function normaliseEditKey(key: string): string {
	return key.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

/** True if this looks like a complete key, before spending a hash on it. */
export function isWellFormedEditKey(key: string): boolean {
	return normaliseEditKey(key).length === KEY_BYTES * 2;
}

/** SHA-256 of the normalised key, lowercase hex. Same result in Node and browsers. */
export async function hashEditKey(key: string): Promise<string> {
	const data = new TextEncoder().encode(normaliseEditKey(key));
	const digest = await crypto.subtle.digest('SHA-256', data);
	return toHex(new Uint8Array(digest));
}

/**
 * Constant-time-ish comparison. Both sides are fixed-length hex from the same hash,
 * so this is belt and braces rather than a strict requirement.
 */
export function editKeyHashesMatch(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
