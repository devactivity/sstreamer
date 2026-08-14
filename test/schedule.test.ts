import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	zonedToUtc,
	zonedDate,
	addDays,
	upcomingOccurrences,
	liveOccurrence,
	nextOccurrence,
	staleness,
	hasSchedule,
} from '../src/lib/schedule.ts';

const iso = (ms: number) => new Date(ms).toISOString();

describe('zonedToUtc - Indonesian zones (no DST)', () => {
	it('Jakarta 20:00 is 13:00Z', () =>
		assert.equal(
			iso(zonedToUtc('2026-08-17', '20:00', 'Asia/Jakarta')),
			'2026-08-17T13:00:00.000Z',
		));

	it('Makassar 09:00 is 01:00Z', () =>
		assert.equal(
			iso(zonedToUtc('2026-08-18', '09:00', 'Asia/Makassar')),
			'2026-08-18T01:00:00.000Z',
		));

	it('Jayapura 20:00 is 11:00Z', () =>
		assert.equal(
			iso(zonedToUtc('2026-08-17', '20:00', 'Asia/Jayapura')),
			'2026-08-17T11:00:00.000Z',
		));

	it('an early-morning slot rolls back to the previous UTC day', () =>
		assert.equal(
			iso(zonedToUtc('2026-08-17', '00:30', 'Asia/Jakarta')),
			'2026-08-16T17:30:00.000Z',
		));
});

describe('zonedToUtc - DST zone, exercising the two-pass correction', () => {
	it('New York in summer is UTC-4', () =>
		assert.equal(
			iso(zonedToUtc('2026-07-01', '12:00', 'America/New_York')),
			'2026-07-01T16:00:00.000Z',
		));

	it('New York in winter is UTC-5', () =>
		assert.equal(
			iso(zonedToUtc('2026-01-15', '12:00', 'America/New_York')),
			'2026-01-15T17:00:00.000Z',
		));

	it('resolves the hour just before spring-forward', () =>
		assert.equal(
			iso(zonedToUtc('2026-03-08', '01:00', 'America/New_York')),
			'2026-03-08T06:00:00.000Z',
		));

	it('resolves the hour just after spring-forward', () =>
		assert.equal(
			iso(zonedToUtc('2026-03-08', '03:00', 'America/New_York')),
			'2026-03-08T07:00:00.000Z',
		));
});

describe('zonedDate / addDays', () => {
	it('maps an instant to the streamer\'s calendar date', () =>
		assert.equal(zonedDate(Date.parse('2026-08-16T17:30:00Z'), 'Asia/Jakarta'), '2026-08-17'));

	it('the same instant is still the previous day in UTC', () =>
		assert.equal(zonedDate(Date.parse('2026-08-16T17:30:00Z'), 'UTC'), '2026-08-16'));

	it('crosses a month boundary', () => assert.equal(addDays('2026-08-30', 3), '2026-09-02'));
	it('crosses a year boundary', () => assert.equal(addDays('2026-12-31', 1), '2027-01-01'));
	it('handles a leap day', () => assert.equal(addDays('2028-02-28', 1), '2028-02-29'));
});

/** Mon/Wed/Fri 20:00-23:00 WIB, with a cancellation and an extra stream. */
const data = {
	name: 'Test',
	aliases: [],
	timezone: 'Asia/Jakarta',
	games: [],
	channels: [],
	verified: false,
	updated: '2026-08-11',
	schedule: {
		recurring: [{ days: ['mon', 'wed', 'fri'], start: '20:00', duration_min: 180, title: 'Rank' }],
		overrides: [
			{ date: '2026-08-21', status: 'cancelled', duration_min: 120, note: 'Libur' },
			{ date: '2026-08-22', status: 'extra', start: '19:00', duration_min: 240, title: 'Turnamen' },
		],
	},
} as any;

/** Thursday 13 Aug 2026, 09:00 WIB. */
const now = Date.parse('2026-08-13T02:00:00Z');

describe('recurrence expansion', () => {
	const occ = upcomingOccurrences(data, { now, days: 14 });

	it('maps weekdays correctly - Friday 14 Aug is the first hit', () => {
		assert.equal(occ[0].date, '2026-08-14');
		assert.equal(iso(occ[0].startUtc), '2026-08-14T13:00:00.000Z');
	});

	it('only produces mon/wed/fri dates', () => {
		const allowed = new Set([
			'2026-08-14',
			'2026-08-17',
			'2026-08-19',
			'2026-08-21',
			'2026-08-24',
			'2026-08-26',
		]);
		for (const o of occ) {
			if (o.status === 'extra') continue;
			assert.ok(allowed.has(o.date), `unexpected date ${o.date}`);
		}
	});

	it('returns results sorted ascending', () => {
		for (let i = 1; i < occ.length; i++) assert.ok(occ[i].startUtc >= occ[i - 1].startUtc);
	});

	it('excludes anything that already finished', () => {
		for (const o of occ) assert.ok(o.endUtc > now);
	});

	it('applies the block duration', () =>
		assert.equal(occ[0].endUtc - occ[0].startUtc, 180 * 60_000));

	it('surfaces a cancelled day instead of dropping it', () => {
		const c = occ.find((o) => o.date === '2026-08-21');
		assert.ok(c, 'expected an entry on 2026-08-21');
		assert.equal(c.status, 'cancelled');
		assert.equal(c.note, 'Libur');
		assert.equal(c.title, 'Rank', 'keeps the recurring block it cancels');
	});

	it('adds an extra stream on a non-scheduled day', () => {
		const e = occ.find((o) => o.date === '2026-08-22');
		assert.ok(e, 'expected an entry on 2026-08-22');
		assert.equal(e.status, 'extra');
		assert.equal(iso(e.startUtc), '2026-08-22T12:00:00.000Z'); // 19:00 WIB
		assert.equal(e.endUtc - e.startUtc, 240 * 60_000);
	});
});

describe('override precedence', () => {
	it('"moved" replaces the recurring block rather than duplicating it', () => {
		const moved = upcomingOccurrences(
			{
				...data,
				schedule: {
					recurring: data.schedule.recurring,
					overrides: [
						{
							date: '2026-08-14',
							status: 'moved',
							start: '22:00',
							duration_min: 60,
							title: 'Mundur',
						},
					],
				},
			} as any,
			{ now, days: 3 },
		);

		const onDay = moved.filter((o) => o.date === '2026-08-14');
		assert.equal(onDay.length, 1);
		assert.equal(onDay[0].status, 'moved');
		assert.equal(iso(onDay[0].startUtc), '2026-08-14T15:00:00.000Z'); // 22:00 WIB
	});

	it('a cancelled day suppresses an extra on the same date', () => {
		const clash = upcomingOccurrences(
			{
				...data,
				schedule: {
					recurring: data.schedule.recurring,
					overrides: [
						{ date: '2026-08-14', status: 'cancelled', duration_min: 120, note: 'Sakit' },
						{
							date: '2026-08-14',
							status: 'extra',
							start: '22:00',
							duration_min: 60,
							title: 'Nyusul',
						},
					],
				},
			} as any,
			{ now, days: 3 },
		);

		const onDay = clash.filter((o) => o.date === '2026-08-14');
		assert.equal(onDay.length, 1);
		assert.equal(onDay[0].status, 'cancelled');
	});
});

describe('live / next occurrence', () => {
	const win = (start: string, end: string, status = 'scheduled') =>
		({
			date: start.slice(0, 10),
			startUtc: Date.parse(start),
			endUtc: Date.parse(end),
			status,
		}) as any;

	const slots = [
		win('2026-08-14T13:00:00Z', '2026-08-14T16:00:00Z'),
		win('2026-08-17T13:00:00Z', '2026-08-17T16:00:00Z'),
	];

	it('finds the occurrence running right now', () => {
		const live = liveOccurrence(slots, Date.parse('2026-08-14T14:30:00Z'));
		assert.equal(live?.startUtc, Date.parse('2026-08-14T13:00:00Z'));
	});

	it('counts the exact start instant as live', () =>
		assert.ok(liveOccurrence(slots, Date.parse('2026-08-14T13:00:00Z'))));

	it('is not live at the exact end instant', () =>
		assert.equal(liveOccurrence(slots, Date.parse('2026-08-14T16:00:00Z')), undefined));

	it('is not live between slots', () =>
		assert.equal(liveOccurrence(slots, Date.parse('2026-08-15T12:00:00Z')), undefined));

	it('never reports a cancelled slot as live', () => {
		const cancelled = [win('2026-08-14T13:00:00Z', '2026-08-14T16:00:00Z', 'cancelled')];
		assert.equal(liveOccurrence(cancelled, Date.parse('2026-08-14T14:30:00Z')), undefined);
	});

	it('nextOccurrence skips the one currently running', () => {
		const next = nextOccurrence(slots, Date.parse('2026-08-14T14:30:00Z'));
		assert.equal(next?.startUtc, Date.parse('2026-08-17T13:00:00Z'));
	});

	it('nextOccurrence skips cancelled slots', () => {
		const mixed = [
			win('2026-08-15T13:00:00Z', '2026-08-15T16:00:00Z', 'cancelled'),
			win('2026-08-17T13:00:00Z', '2026-08-17T16:00:00Z'),
		];
		const next = nextOccurrence(mixed, Date.parse('2026-08-14T18:00:00Z'));
		assert.equal(next?.startUtc, Date.parse('2026-08-17T13:00:00Z'));
	});

	it('nextOccurrence returns undefined once everything has started', () =>
		assert.equal(nextOccurrence(slots, Date.parse('2026-08-18T00:00:00Z')), undefined));
});

describe('staleness / hasSchedule', () => {
	const ref = Date.parse('2026-08-13T00:00:00Z');

	it('is fresh under 14 days', () => assert.equal(staleness('2026-08-11', ref).level, 'fresh'));
	it('is aging past 14 days', () => assert.equal(staleness('2026-07-25', ref).level, 'aging'));
	it('is stale past 30 days', () => assert.equal(staleness('2026-07-01', ref).level, 'stale'));
	it('counts elapsed days', () => assert.equal(staleness('2026-08-11', ref).days, 2));

	it('treats a bare profile as having no schedule', () =>
		assert.equal(hasSchedule({ schedule: { recurring: [], overrides: [] } } as any), false));

	it('treats a profile with recurring blocks as complete', () =>
		assert.equal(hasSchedule(data), true));
});
