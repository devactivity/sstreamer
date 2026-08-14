/**
 * RFC 4180 CSV, written by hand to keep the scripts dependency-free.
 *
 * Used for the public data dump and for the admin backup/restore round trip, so
 * encode and parse must be exact inverses - a lossy round trip would corrupt the
 * only copy of the data on import.
 */

/** Fields need quoting if they contain a delimiter, a quote, or a line break. */
function encodeField(value: string): string {
	if (/[",\r\n]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/** CRLF line endings, as the spec says: Excel is the fussiest consumer here. */
export function encodeCsv(rows: readonly (readonly string[])[]): string {
	return rows.map((row) => row.map(encodeField).join(',')).join('\r\n');
}

/**
 * Parse CSV into rows of raw strings. Accepts CRLF or LF, doubled quotes inside
 * quoted fields, and embedded delimiters and newlines.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let i = 0;

	// A trailing newline shouldn't produce a phantom empty row.
	const src = text.replace(/\r\n?$/, '').replace(/\n$/, '');

	while (i < src.length) {
		const ch = src[i];

		if (quoted) {
			if (ch === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				quoted = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}

		if (ch === '"') {
			quoted = true;
			i++;
			continue;
		}

		if (ch === ',') {
			row.push(field);
			field = '';
			i++;
			continue;
		}

		if (ch === '\r' || ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
			continue;
		}

		field += ch;
		i++;
	}

	row.push(field);
	rows.push(row);
	return rows;
}

/** Parse into objects keyed by the header row. */
export function parseCsvRecords(text: string): Record<string, string>[] {
	const rows = parseCsv(text);
	if (rows.length === 0) return [];
	const [header, ...body] = rows;

	return body
		// A blank trailing line parses as [''] - not a record.
		.filter((r) => r.length > 1 || r[0] !== '')
		.map((r) => {
			const record: Record<string, string> = {};
			header.forEach((key, idx) => {
				record[key] = r[idx] ?? '';
			});
			return record;
		});
}
