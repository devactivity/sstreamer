export const PLATFORMS = ['youtube', 'tiktok', 'facebook', 'twitch'] as const;
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Indonesia has no DST, but store IANA zones anyway so viewers abroad convert correctly. */
export const TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;

/**
 * Shared with the content schema so the sync can reject an over-long bio before it
 * reaches Zod. Two copies of this number would drift, and the drift would only show
 * up as a failed sync run.
 */
export const MAX_BIO_LENGTH = 280;

export type Platform = (typeof PLATFORMS)[number];
export type Day = (typeof DAYS)[number];
export type Timezone = (typeof TIMEZONES)[number];
