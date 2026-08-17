/**
 * Posting to a Google Form endpoint, shared by every form on the site.
 *
 * Two forms feed this site and they are deliberately separate: profile submissions go
 * to one spreadsheet the sync reads, contact messages go to another it never touches.
 * The mechanics of talking to Google are identical though, so they live here once.
 */

/**
 * Map field names onto Google's entry ids, dropping anything empty or unmapped.
 * Empty means "leave alone" on the sync side, so sending blanks would be wrong -
 * a half-filled edit form must not wipe existing data.
 */
export function toEntries<F extends string>(
	fields: Partial<Record<F, string>>,
	ids: Record<F, string>,
): [string, string][] {
	const entries: [string, string][] = [];
	for (const [field, value] of Object.entries(fields) as [F, string | undefined][]) {
		const id = ids[field]?.trim();
		const trimmed = value?.trim();
		if (id && trimmed) entries.push([id, trimmed]);
	}
	return entries;
}

/**
 * Send entries to a form endpoint.
 *
 * Google Forms sends no CORS headers, so this must be a `no-cors` request and the
 * response is opaque. Resolving means the request left the browser - it does NOT
 * mean the form accepted it. Callers must word their confirmation accordingly.
 */
export async function postToForm(action: string, entries: [string, string][]): Promise<void> {
	const body = new FormData();
	for (const [id, value] of entries) body.append(id, value);

	await fetch(action, { method: 'POST', mode: 'no-cors', body });
}
