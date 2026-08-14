/**
 * Browser-side live detection, shared by the directory cards and the schedule lists.
 *
 * This deliberately runs in the browser rather than at build time: a static page is a
 * snapshot, so "live now" baked in during the build is wrong within minutes. The build
 * emits time windows and the browser decides.
 *
 * Everything here is schedule-derived. It means the streamer planned to be live, never
 * that they verifiably are.
 */

export type Window = { start: number; end: number };

/** Parse the compact `data-occ="start,end|start,end"` format. */
export function parseWindows(attr: string | undefined | null): Window[] {
	if (!attr) return [];
	return attr
		.split('|')
		.map((pair) => {
			const [start, end] = pair.split(',').map(Number);
			return { start, end };
		})
		.filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
}

/** Half-open: a stream ending at 23:00 is not live at 23:00. */
export function liveWindow(windows: Window[], now: number): Window | undefined {
	return windows.find((w) => w.start <= now && now < w.end);
}

export function nextWindow(windows: Window[], now: number): Window | undefined {
	return windows.find((w) => w.start > now);
}

/** Run `fn` immediately, then on an interval so badges appear without a reload. */
export function tick(fn: () => void, intervalMs = 60_000): void {
	fn();
	setInterval(fn, intervalMs);
}

/** The viewer's zone abbreviation, e.g. "WIB" or "GMT+1". */
export function viewerZoneName(lang: string): string {
	return (
		new Intl.DateTimeFormat(lang, { timeZoneName: 'short' })
			.formatToParts(Date.now())
			.find((p) => p.type === 'timeZoneName')?.value ?? ''
	);
}

export function docLang(): string {
	return document.documentElement.lang === 'id' ? 'id-ID' : 'en-GB';
}
