/**
 * Compact wire format for a streamer's extra schedule blocks.
 *
 * Google Forms is flat: every extra field is another question created by hand and
 * another entry id to chase down. Packing the blocks into one column holds that cost
 * at a single question however many blocks are allowed, and the value stays readable
 * enough to moderate by eye in the sheet:
 *
 *   valorant|sat,sun|12:00|180;genshin-impact|fri|21:00|120
 *
 * The first block keeps its own dedicated columns, so none of the existing form
 * questions or entry ids change.
 *
 * A fifth field carries an optional per-block platform, for a streamer who plays one
 * game on YouTube and another on TikTok. It is safe in a delimited field where `title`
 * is not, because it is a closed vocabulary from `PLATFORMS` containing no separator
 * characters, whereas a title is free text that would need escaping. Blocks written
 * without it stay valid and keep inheriting the profile's primary platform, so values
 * encoded before this field existed still decode correctly.
 *
 * Per-block `title` is still deliberately not carried here.
 */

// Explicit extension so this module runs under plain `node` for testing, not just Vite.
import { DAYS, PLATFORMS } from './constants.ts';

export type ScheduleBlock = {
	game: string;
	days: string[];
	start: string;
	duration_min: number;
	/** Absent means inherit the profile's primary platform. */
	platform?: string;
};

const BLOCK_SEP = ';';
const FIELD_SEP = '|';
const DAY_SEP = ',';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_DURATION = 120;
export const MAX_DURATION = 1440;

/**
 * Exported so the sync validates the first schedule block by the same rule as the
 * packed ones. The first block has its own sheet columns and used to be checked more
 * loosely, which let a `start` of "banana" through to the schema and failed the build.
 */
export const isValidTime = (value: string) => TIME.test(value);

/** Matches the schema: a whole number of minutes, at least one, at most a full day. */
export const isValidDuration = (value: number) =>
	Number.isInteger(value) && value > 0 && value <= MAX_DURATION;

/**
 * Anyone can POST to the form endpoint, so cap what one cell can turn into. Well past
 * what the UI offers, and far short of a payload that would bloat the build.
 */
export const MAX_BLOCKS = 8;

const dayOrder = (day: string) => DAYS.indexOf(day as (typeof DAYS)[number]);
const isPlatform = (value: string) => (PLATFORMS as readonly string[]).includes(value);

export function encodeBlocks(blocks: ScheduleBlock[]): string {
	return blocks
		.filter((b) => b.days.length > 0 && TIME.test(b.start))
		.map((b) => {
			const fields = [
				b.game,
				[...b.days].sort((a, z) => dayOrder(a) - dayOrder(z)).join(DAY_SEP),
				b.start,
				String(b.duration_min),
			];
			// Appended only when set, so a block with no platform encodes exactly as it
			// did before this field existed and diffs stay quiet.
			if (b.platform && isPlatform(b.platform)) fields.push(b.platform);
			return fields.join(FIELD_SEP);
		})
		.join(BLOCK_SEP);
}

/**
 * Invalid blocks are dropped rather than thrown on. This parses whatever a public form
 * put in a spreadsheet cell, and one malformed value must not fail the whole sync. The
 * Zod schema is still the final word at build time.
 */
export function decodeBlocks(raw: string | undefined | null): ScheduleBlock[] {
	const blocks: ScheduleBlock[] = [];

	for (const chunk of String(raw ?? '').split(BLOCK_SEP)) {
		if (blocks.length >= MAX_BLOCKS) break;
		if (!chunk.trim()) continue;

		const [game = '', days = '', start = '', duration = '', platform = ''] = chunk
			.split(FIELD_SEP)
			.map((part) => part.trim());

		const dayList = days
			.split(DAY_SEP)
			.map((d) => d.trim().toLowerCase())
			.filter(Boolean);

		if (dayList.length === 0) continue;
		if (!dayList.every((d) => dayOrder(d) !== -1)) continue;
		if (!TIME.test(start)) continue;

		const minutes = Number(duration);
		const normalisedPlatform = platform.toLowerCase();

		blocks.push({
			game,
			// De-duplicated because "mon,mon" would otherwise produce two streams at the
			// same instant, and sorted so the generated YAML is stable across syncs.
			days: [...new Set(dayList)].sort((a, z) => dayOrder(a) - dayOrder(z)),
			start,
			duration_min: isValidDuration(minutes) ? minutes : DEFAULT_DURATION,
			// An unrecognised platform falls back to inheriting rather than dropping the
			// block: the schedule is the point, and a bad platform would fail the schema
			// and take the whole sync run down with it.
			...(isPlatform(normalisedPlatform) ? { platform: normalisedPlatform } : {}),
		});
	}

	return blocks;
}
