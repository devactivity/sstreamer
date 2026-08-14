export const PLATFORMS = ['youtube', 'tiktok', 'facebook', 'twitch'] as const;
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Indonesia has no DST, but store IANA zones anyway so viewers abroad convert correctly. */
export const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;

export type Platform = (typeof PLATFORMS)[number];
export type Day = (typeof DAYS)[number];
export type Timezone = (typeof TIMEZONES)[number];
