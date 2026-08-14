/**
 * Search normalisation, shared by the build-time haystack and the browser filter.
 * Both sides must agree exactly or typing an accented name stops matching.
 *
 * Kept in its own module so the client bundle doesn't pull in the whole i18n dictionary.
 */
export function normalise(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '') // drop combining marks left by NFD
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Name to URL slug.
 *
 * Shared deliberately between the browser and the sync Action: the browser derives
 * a slug to target an existing profile, and the Action derives one to name the file.
 * If the two ever disagreed, a second submission would create a duplicate profile
 * instead of updating the first.
 */
export function slugify(name: string): string {
	return String(name ?? '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}
