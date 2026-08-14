import type { CollectionEntry } from 'astro:content';
// Explicit extension so this module runs under plain `node` for testing, not just Vite.
import { DAYS } from './constants.ts';

export type Streamer = CollectionEntry<'streamers'>;
export type StreamerData = Streamer['data'];

export type Occurrence = {
	/** Local calendar date in the streamer's own timezone, YYYY-MM-DD. */
	date: string;
	/** Absolute instant, ms since epoch. The client renders this in the viewer's zone. */
	startUtc: number;
	endUtc: number;
	status: 'scheduled' | 'cancelled' | 'moved' | 'extra';
	title?: string;
	game?: string;
	platform?: string;
	note?: string;
};

/**
 * An occurrence prepared for rendering. Carries its own timezone and streamer so
 * one list can mix streamers across WIB/WITA/WIT, which a game page does.
 */
export type DisplayOccurrence = Occurrence & {
	/** Overrides the list-level timezone for the no-JS fallback render. */
	timezone?: string;
	streamer?: { name: string; slug: string };
};

/**
 * Offset of `timeZone` from UTC at instant `ts`, in ms.
 * Formats the instant in the target zone, reads it back as if it were UTC, and
 * takes the difference - the standard trick for getting a zone offset out of Intl.
 */
function zoneOffsetMs(ts: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(ts);

	const p: Record<string, string> = {};
	for (const part of parts) p[part.type] = part.value;

	// Some engines render midnight as hour "24"; normalise before doing arithmetic.
	const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
	return asUtc - ts;
}

/** Turn "2026-08-17" + "20:00" in `timeZone` into an absolute UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): number {
	const [y, m, d] = date.split('-').map(Number);
	const [hh, mm] = time.split(':').map(Number);
	const naive = Date.UTC(y, m - 1, d, hh, mm);

	// Two passes: the offset at the naive instant gets us close enough to look up
	// the true offset at the real instant. Only matters on DST boundaries - a no-op
	// for Indonesian zones, but keeps this correct if non-ID streamers are ever added.
	const guess = naive - zoneOffsetMs(naive, timeZone);
	return naive - zoneOffsetMs(guess, timeZone);
}

/** Calendar date (YYYY-MM-DD) at instant `ts`, as seen in `timeZone`. */
export function zonedDate(ts: number, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(ts);

	const p: Record<string, string> = {};
	for (const part of parts) p[part.type] = part.value;
	return `${p.year}-${p.month}-${p.day}`;
}

/** Shift a YYYY-MM-DD string by whole calendar days. */
export function addDays(date: string, n: number): string {
	const [y, m, d] = date.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d + n));
	return t.toISOString().slice(0, 10);
}

/** Our weekday key ('mon'..'sun') for a calendar date. */
function weekdayKey(date: string): (typeof DAYS)[number] {
	const [y, m, d] = date.split('-').map(Number);
	const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sunday = 0
	return DAYS[(jsDow + 6) % 7]; // shift so Monday = 0
}

/**
 * Expand a streamer's recurring rules plus overrides into concrete occurrences.
 *
 * Override semantics, kept deliberately simple so they're explainable in the form:
 *   cancelled - the whole day is off. Recurring blocks are still listed, struck
 *               through, so viewers see the usual slot is cancelled rather than
 *               an unexplained gap. Any moved/extra on that date is suppressed too.
 *   moved     - replaces that day's recurring blocks with the given time
 *   extra     - added on top of whatever already runs that day
 */
export function upcomingOccurrences(
	data: StreamerData,
	opts: { now?: number; days?: number } = {},
): Occurrence[] {
	const now = opts.now ?? Date.now();
	const horizon = opts.days ?? 14;
	const tz = data.timezone;

	const byDate = new Map<string, typeof data.schedule.overrides>();
	for (const o of data.schedule.overrides) {
		const list = byDate.get(o.date) ?? [];
		list.push(o);
		byDate.set(o.date, list);
	}

	const build = (
		date: string,
		start: string,
		durationMin: number,
		status: Occurrence['status'],
		rest: Partial<Occurrence>,
	): Occurrence => {
		const startUtc = zonedToUtc(date, start, tz);
		return { date, startUtc, endUtc: startUtc + durationMin * 60_000, status, ...rest };
	};

	const out: Occurrence[] = [];
	const today = zonedDate(now, tz);

	for (let i = 0; i < horizon; i++) {
		const date = addDays(today, i);
		const dow = weekdayKey(date);
		const overrides = byDate.get(date) ?? [];

		const cancelled = overrides.filter((o) => o.status === 'cancelled');
		const moved = overrides.filter((o) => o.status === 'moved');
		const extra = overrides.filter((o) => o.status === 'extra');
		const replaced = cancelled.length > 0 || moved.length > 0;

		for (const block of data.schedule.recurring) {
			if (!block.days.includes(dow)) continue;
			if (replaced) {
				// Surface the cancellation rather than silently dropping it - a viewer
				// needs to know the usual stream is off, not just see an empty day.
				if (cancelled.length > 0) {
					out.push(
						build(date, block.start, block.duration_min, 'cancelled', {
							title: block.title,
							game: block.game,
							platform: block.platform,
							note: cancelled[0].note,
						}),
					);
				}
				continue;
			}
			out.push(
				build(date, block.start, block.duration_min, 'scheduled', {
					title: block.title,
					game: block.game,
					platform: block.platform,
				}),
			);
		}

		// A cancelled day is off entirely - an "extra" that survived it would be
		// a contradiction, so it loses to the cancellation.
		if (cancelled.length === 0) {
			for (const o of [...moved, ...extra]) {
				out.push(
					build(date, o.start!, o.duration_min, o.status as 'moved' | 'extra', {
						title: o.title,
						game: o.game,
						platform: o.platform,
						note: o.note,
					}),
				);
			}
		}
	}

	// Drop anything that already finished, then order by start time.
	return out.filter((o) => o.endUtc > now).sort((a, b) => a.startUtc - b.startUtc);
}

/**
 * The occurrence running at `now`, if any. Schedule-derived only: it says the
 * streamer planned to be live, never that they verifiably are. Cancelled slots
 * are excluded, since a cancelled stream is the one thing we know isn't running.
 *
 * Callers should evaluate this in the browser, not at build time - a static page
 * is a snapshot, and "live now" computed during the build is wrong within minutes.
 */
export function liveOccurrence(
	occurrences: readonly Occurrence[],
	now: number = Date.now(),
): Occurrence | undefined {
	return occurrences.find(
		(o) => o.status !== 'cancelled' && o.startUtc <= now && now < o.endUtc,
	);
}

/** The next occurrence that has not started yet. */
export function nextOccurrence(
	occurrences: readonly Occurrence[],
	now: number = Date.now(),
): Occurrence | undefined {
	return occurrences.find((o) => o.status !== 'cancelled' && o.startUtc > now);
}

/** A profile with no recurring blocks and no future overrides is a bare stub. */
export function hasSchedule(data: StreamerData): boolean {
	return data.schedule.recurring.length > 0 || data.schedule.overrides.length > 0;
}

export type Staleness = 'fresh' | 'aging' | 'stale';

/**
 * Every schedule here is hand-maintained, so age is the main signal of whether
 * to trust it. Past 30 days we stop presenting it as fact.
 */
export function staleness(updated: string, now: number = Date.now()): {
	level: Staleness;
	days: number;
} {
	const [y, m, d] = updated.split('-').map(Number);
	const days = Math.max(0, Math.floor((now - Date.UTC(y, m - 1, d)) / 86_400_000));
	const level: Staleness = days > 30 ? 'stale' : days > 14 ? 'aging' : 'fresh';
	return { level, days };
}
