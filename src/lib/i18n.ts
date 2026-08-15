export const LANGS = ['id', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Indonesian zone abbreviations, mapped by hand so they never depend on ICU data. */
export const ZONE_LABEL: Record<string, string> = {
	'Asia/Jakarta': 'WIB',
	'Asia/Makassar': 'WITA',
	'Asia/Jayapura': 'WIT',
};

export const PLATFORM_LABEL: Record<string, string> = {
	youtube: 'YouTube',
	tiktok: 'TikTok',
	facebook: 'Facebook Gaming',
	twitch: 'Twitch',
};

/** Fall back to a conventional profile URL when the submission didn't include one. */
export function channelUrl(platform: string, handle: string, explicit?: string): string {
	if (explicit) return explicit;
	const h = handle.replace(/^@/, '');
	switch (platform) {
		case 'youtube':
			return `https://youtube.com/@${h}`;
		case 'tiktok':
			return `https://tiktok.com/@${h}`;
		case 'twitch':
			return `https://twitch.tv/${h}`;
		case 'facebook':
			return `https://facebook.com/${h}`;
		default:
			return `https://${h}`;
	}
}

/** Re-exported so existing callers keep working; the client imports it directly. */
export { normalise } from './text';

const dict = {
	id: {
		siteName: 'Sstreamer',
		tagline: 'Cari tahu kapan streamer game favoritmu live.',
		searchPlaceholder: 'Cari nama streamer...',
		searchLabel: 'Cari streamer',
		noResults: 'Streamer tidak ditemukan.',
		noResultsHint: 'Coba nama lain, atau daftarkan dirimu di bawah.',
		allGames: 'Semua game',
		streamerCount: (n: number) => `${n} streamer`,
		noSchedule: 'Belum ada jadwal',
		noScheduleLong: 'Streamer ini belum melengkapi jadwalnya.',
		verified: 'Terverifikasi',
		upcoming: 'Jadwal 2 minggu ke depan',
		nothingUpcoming: 'Tidak ada jadwal dalam 2 minggu ke depan.',
		today: 'Hari ini',
		tomorrow: 'Besok',
		cancelled: 'Dibatalkan',
		moved: 'Jadwal diubah',
		extra: 'Tambahan',
		tzNote: (zone: string) => `Waktu ditampilkan dalam zona waktumu (${zone}).`,
		tzNoteFallback: (zone: string) => `Waktu ditampilkan dalam ${zone}.`,
		streamerTime: (t: string) => `Waktu streamer: ${t}`,
		updatedAgo: (n: number) => (n === 0 ? 'Diperbarui hari ini' : `Diperbarui ${n} hari lalu`),
		unconfirmed: 'Belum dikonfirmasi',
		unconfirmedLong:
			'Jadwal ini sudah lebih dari 30 hari tidak diperbarui, jadi belum tentu akurat.',
		claimCta: 'Kamu streamer?',
		claimCtaBody: 'Tulis namamu, profilmu langsung dibuat.',
		claimNameLabel: 'Nama streamer kamu',
		claimSubmit: 'Buat profil',
		backToDirectory: 'Semua streamer',
		otherLang: 'English',
		channels: 'Channel',
		alsoKnownAs: 'Dikenal juga sebagai',
		nextStream: 'Live berikutnya',
		dayShort: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
		profileDesc: (name: string) => `Jadwal live ${name}: hari, jam, platform, dan game.`,
		claimStep2: (name: string) => `Halo ${name}! Lengkapi profilmu sekarang?`,
		claimStep2Hint: 'Semua opsional - bisa dilengkapi nanti di halaman profilmu.',
		claimPlatformLabel: 'Platform utama',
		claimHandleLabel: 'Username di platform',
		claimGameLabel: 'Game utama',
		claimDaysLabel: 'Hari live',
		claimTimeLabel: 'Jam mulai',
		claimSave: 'Simpan profil',
		claimLater: 'Nanti saja',
		claimTakenTitle: (name: string) => `"${name}" sudah terdaftar di sini.`,
		claimTakenBody: 'Kalau itu kamu, buka profilnya dan pakai kunci edit untuk mengubah jadwalmu.',
		claimTakenOpen: 'Ini saya, buka profil saya',
		claimTakenContinue: 'Bukan saya, lanjutkan',
		claimTakenContinueHint: 'Nama yang sama diperiksa manual dulu, jadi tidak langsung tayang.',
		claimPending: 'Form belum terhubung ke penyimpanan. Ini baru pratinjau tampilan.',
		liveNow: 'Live sekarang',
		liveNowTitle: 'Menurut jadwal streamer ini sedang live. Bukan status live sebenarnya.',
		liveDisclaimer: 'Status live dihitung dari jadwal, bukan dari platform.',
		filterLive: 'Sedang live saja',
		noneLive: 'Tidak ada yang sedang live menurut jadwal.',
		playedBy: 'Streamer yang main game ini',
		gameSchedule: 'Jadwal game ini 2 minggu ke depan',
		noStreamersForGame: 'Belum ada streamer untuk game ini.',
		gameDesc: (name: string) => `Jadwal live streamer ${name} di Indonesia.`,
		allGamesTitle: 'Semua game',
		browseGames: 'Lihat per game',
		themeLabel: 'Ganti tema',
		themeSystem: 'Ikut sistem',
		themeLight: 'Terang',
		themeDark: 'Gelap',
		dataExport: 'Data CSV',
		keyIssuedTitle: 'Simpan kunci edit ini',
		keyIssuedBody:
			'Ini satu-satunya cara kamu bisa mengubah profilmu nanti. Kunci ini tidak disimpan di mana pun dan tidak bisa dikirim ulang. Screenshot atau salin sekarang.',
		keyCopy: 'Salin',
		keyCopied: 'Tersalin',
		editProfile: 'Ini saya, mau edit profil',
		editKeyLabel: 'Kunci edit',
		editKeyHint: 'Kunci yang kamu simpan waktu pertama kali buat profil.',
		editKeyBad: 'Format kunci tidak sesuai. Harusnya 8 grup 4 karakter.',
		editSubmit: 'Kirim perubahan',
		editLostKey: 'Lupa kunci? Kirim saja, nanti diperiksa manual sebelum tayang.',
		sentNew: 'Terkirim. Profil baru diperiksa dulu sebelum tayang.',
		sentEdit:
			'Terkirim. Kalau kunci edit-mu cocok, perubahan tayang sekitar 15 menit. Kalau tidak, diperiksa manual dulu.',
		sendFailed: 'Gagal mengirim. Coba lagi sebentar lagi.',
		emptyDirectory: 'Belum ada streamer di sini.',
		emptyDirectoryHint: 'Jadilah yang pertama, tulis namamu di bawah.',
	},
	en: {
		siteName: 'Sstreamer',
		tagline: 'Find out when your favourite game streamers go live.',
		searchPlaceholder: 'Search streamer name...',
		searchLabel: 'Search streamers',
		noResults: 'No streamer found.',
		noResultsHint: 'Try another name, or add yourself below.',
		allGames: 'All games',
		streamerCount: (n: number) => `${n} streamer${n === 1 ? '' : 's'}`,
		noSchedule: 'No schedule yet',
		noScheduleLong: 'This streamer has not filled in their schedule.',
		verified: 'Verified',
		upcoming: 'Next 2 weeks',
		nothingUpcoming: 'Nothing scheduled in the next 2 weeks.',
		today: 'Today',
		tomorrow: 'Tomorrow',
		cancelled: 'Cancelled',
		moved: 'Rescheduled',
		extra: 'Extra stream',
		tzNote: (zone: string) => `Times shown in your timezone (${zone}).`,
		tzNoteFallback: (zone: string) => `Times shown in ${zone}.`,
		streamerTime: (t: string) => `Streamer's local time: ${t}`,
		updatedAgo: (n: number) =>
			n === 0 ? 'Updated today' : `Updated ${n} day${n === 1 ? '' : 's'} ago`,
		unconfirmed: 'Unconfirmed',
		unconfirmedLong:
			'This schedule has not been updated in over 30 days, so it may not be accurate.',
		claimCta: 'Are you a streamer?',
		claimCtaBody: 'Enter your name and your profile is created right away.',
		claimNameLabel: 'Your streamer name',
		claimSubmit: 'Create profile',
		backToDirectory: 'All streamers',
		otherLang: 'Bahasa Indonesia',
		channels: 'Channels',
		alsoKnownAs: 'Also known as',
		nextStream: 'Next stream',
		dayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
		profileDesc: (name: string) => `${name}'s live schedule: days, times, platform and games.`,
		claimStep2: (name: string) => `Hi ${name}! Want to complete your profile now?`,
		claimStep2Hint: 'All optional - you can fill this in later from your profile page.',
		claimPlatformLabel: 'Main platform',
		claimHandleLabel: 'Username on that platform',
		claimGameLabel: 'Main game',
		claimDaysLabel: 'Stream days',
		claimTimeLabel: 'Start time',
		claimSave: 'Save profile',
		claimLater: 'Later',
		claimTakenTitle: (name: string) => `"${name}" is already listed.`,
		claimTakenBody: 'If that is you, open the profile and use your edit key to change your schedule.',
		claimTakenOpen: 'That is me, open my profile',
		claimTakenContinue: 'Not me, continue anyway',
		claimTakenContinueHint:
			'A duplicate name is checked by hand first, so it will not appear straight away.',
		claimPending: 'This form is not connected to storage yet - it is a UI preview only.',
		liveNow: 'Live now',
		liveNowTitle: 'Their schedule says they are live now. This is not verified live status.',
		liveDisclaimer: 'Live status is derived from the schedule, not from the platform.',
		filterLive: 'Live now only',
		noneLive: 'Nobody is scheduled to be live right now.',
		playedBy: 'Streamers who play this',
		gameSchedule: 'Next 2 weeks for this game',
		noStreamersForGame: 'No streamers for this game yet.',
		gameDesc: (name: string) => `Live schedules for ${name} streamers in Indonesia.`,
		allGamesTitle: 'All games',
		browseGames: 'Browse by game',
		themeLabel: 'Change theme',
		themeSystem: 'System',
		themeLight: 'Light',
		themeDark: 'Dark',
		dataExport: 'CSV data',
		keyIssuedTitle: 'Save this edit key',
		keyIssuedBody:
			'This is the only way to change your profile later. It is not stored anywhere and cannot be resent. Screenshot or copy it now.',
		keyCopy: 'Copy',
		keyCopied: 'Copied',
		editProfile: 'This is me, edit my profile',
		editKeyLabel: 'Edit key',
		editKeyHint: 'The key you saved when you first created the profile.',
		editKeyBad: 'That key looks wrong. It should be 8 groups of 4 characters.',
		editSubmit: 'Submit changes',
		editLostKey: 'Lost your key? Submit anyway and it will be checked by hand first.',
		sentNew: 'Sent. New profiles are checked before they appear.',
		sentEdit:
			'Sent. If your edit key matched, the change appears in about 15 minutes. If not, it is reviewed by hand first.',
		sendFailed: 'Could not send. Please try again shortly.',
		emptyDirectory: 'No streamers here yet.',
		emptyDirectoryHint: 'Be the first, add your name below.',
	},
} as const;

export function t(lang: Lang) {
	return dict[lang];
}

/** Locale tag for Intl. */
export function locale(lang: Lang): string {
	return lang === 'id' ? 'id-ID' : 'en-GB';
}

/** Prefix a path for the given language. `id` is the default locale and stays unprefixed. */
export function localePath(lang: Lang, path: string): string {
	const clean = path.startsWith('/') ? path : `/${path}`;
	return lang === 'id' ? clean : `/en${clean === '/' ? '' : clean}`;
}
