/**
 * Tells you when a profile submission arrives and whether it needs your hand.
 *
 * This does NOT run in this repo. Paste it into the Apps Script editor bound to the
 * SUBMISSIONS spreadsheet (Extensions > Apps Script). Setup steps are in SETUP.md.
 *
 * A separate Apps Script project from notify-telegram.gs, because a script is bound to
 * one spreadsheet and these are two spreadsheets. That means its own Script Properties
 * too: the same token and chat id have to be entered again here.
 *
 * Why this exists: the sync reports queued rows only to the Actions log, so without a
 * ping nothing tells you a stranger submitted. They would sit unapproved until you
 * happened to open the sheet.
 */

var TOKEN_KEY = 'TELEGRAM_BOT_TOKEN';
var CHAT_KEY = 'TELEGRAM_CHAT_ID';

/** Public data dump of what is currently deployed. Used to tell new from existing. */
var EXPORT_URL = 'https://sstreamer.pages.dev/export.csv';

/**
 * Shown as "touches:" so you can see the shape of a submission without opening the
 * sheet. Deliberately excludes edit_key_hash, and so does everything below: see
 * sendTelegram for why that matters.
 */
var REPORTED_FIELDS = [
	'aliases',
	'bio',
	'timezone',
	'games',
	'platform',
	'handle',
	'game',
	'days',
	'start',
	'duration_min',
	'title',
	'streams',
];

/**
 * Trigger entry point. Attach as an installable "On form submit" trigger; the simple
 * onFormSubmit(e) cannot make external requests.
 */
function onSubmissionSubmit(e) {
	var props = PropertiesService.getScriptProperties();
	var token = props.getProperty(TOKEN_KEY);
	var chatId = props.getProperty(CHAT_KEY);

	if (!token || !chatId) {
		throw new Error('Set ' + TOKEN_KEY + ' and ' + CHAT_KEY + ' in Script Properties first.');
	}

	// namedValues is keyed by question title, so a title cased differently to the field
	// name would read as empty and you would get a blank message with no error anywhere.
	// Keys are folded rather than matched exactly.
	var answers = {};
	var raw = (e && e.namedValues) || {};
	Object.keys(raw).forEach(function (title) {
		answers[String(title).trim().toLowerCase()] = raw[title];
	});

	var field = function (key) {
		return (answers[key] || []).join(' ').trim();
	};

	var slug = field('slug');
	var name = field('name');
	var avatar = field('avatar_url');

	var touched = REPORTED_FIELDS.filter(function (key) {
		return field(key) !== '';
	});

	var lines = [
		'Sstreamer: new submission',
		'',
		'Name: ' + (name || '(not given)'),
		'Slug: ' + (slug || '(not given)'),
	];

	// The interesting bit. A slug the deployed site has never heard of cannot be an
	// edit, so it needs your approval tick before anything is written.
	var known = isKnownSlug(slug);
	if (known === true) {
		lines.push('Existing profile. The sync applies it if the edit key matches.');
		lines.push('Queued instead if it changes the name or picture.');
	} else if (known === false) {
		lines.push('NEW profile. Nothing is written until you tick approved in the sheet.');
	} else {
		lines.push('Could not reach the site to check whether this profile exists.');
	}

	if (touched.length > 0) lines.push('', 'Touches: ' + touched.join(', '));

	// Worth its own line: the sync never writes this, by design. A picture only appears
	// if you save the file into the repo yourself.
	if (avatar) lines.push('', 'Picture requested, needs saving by hand:', avatar);

	sendTelegram(token, chatId, lines.join('\n'));
}

/**
 * Whether the deployed site already has this slug. Returns undefined when the answer
 * is unknown, which callers must not treat as "new".
 *
 * Reads the public CSV rather than the sheet: the sheet holds every submission ever
 * made, including ones still queued, so a slug appearing there says nothing about
 * whether a profile exists. The CSV is what actually shipped.
 *
 * A profile approved minutes ago but not yet deployed still reads as new. That errs
 * toward telling you to look, which is the safe direction.
 */
function isKnownSlug(slug) {
	if (!slug) return undefined;

	try {
		var response = UrlFetchApp.fetch(EXPORT_URL, { muteHttpExceptions: true });
		if (response.getResponseCode() !== 200) return undefined;

		// slug is the first column. Compared field-wise rather than with indexOf, so a
		// slug that merely appears inside a bio or a channel handle is not a match.
		return response
			.getContentText()
			.split('\n')
			.some(function (line) {
				return line.split(',')[0].replace(/^"|"$/g, '').trim() === slug;
			});
	} catch (err) {
		return undefined;
	}
}

/**
 * Send one message.
 *
 * Plain text, no parse_mode: the body carries text a stranger typed, and under Markdown
 * or HTML parsing a stray `*` or `<` makes Telegram reject the whole message, so one
 * unlucky submission could stop you receiving anything at all.
 *
 * Nothing here ever carries edit_key_hash. The hash is what authenticates edits, and a
 * leaked one can be replayed to impersonate a streamer, so it stays in the private
 * sheet rather than being copied into a third party's message history.
 */
function sendTelegram(token, chatId, text) {
	var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
		method: 'post',
		contentType: 'application/json',
		payload: JSON.stringify({
			chat_id: chatId,
			text: text,
			disable_web_page_preview: true,
		}),
		// Without this a non-200 throws before the body can be read, and the body is
		// where Telegram explains what was actually wrong.
		muteHttpExceptions: true,
	});

	var code = response.getResponseCode();
	if (code !== 200) {
		throw new Error('Telegram refused the message (' + code + '): ' + response.getContentText());
	}
}

/**
 * Run once from the editor to prove this project's token and chat id work, without
 * submitting the real form.
 *
 * The chat id is the same value as the contact project, since it is your account, not
 * the bot. If you have lost it, run findChatId in notify-telegram.gs.
 */
function testTelegram() {
	var props = PropertiesService.getScriptProperties();
	sendTelegram(
		props.getProperty(TOKEN_KEY),
		props.getProperty(CHAT_KEY),
		'Sstreamer: test message. If you can read this, submission alerts work.',
	);
}
