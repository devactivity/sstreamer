/**
 * Pushes new contact messages to Telegram, instantly.
 *
 * This does NOT run in this repo. It is kept here so it is version controlled and
 * reviewable; paste it into the Apps Script editor bound to the CONTACT spreadsheet
 * (Extensions > Apps Script). Setup steps are in SETUP.md.
 *
 * Bind it to the contact spreadsheet, never the submissions one. An installable
 * onFormSubmit trigger fires for any form feeding the spreadsheet it belongs to, so
 * sharing one would fire this on every profile edit too.
 *
 * The bot token lives in Script Properties, not in this file. Anyone who can read the
 * token can post as your bot, so it must never reach the repo or the built site.
 */

var TOKEN_KEY = 'TELEGRAM_BOT_TOKEN';
var CHAT_KEY = 'TELEGRAM_CHAT_ID';

/**
 * Trigger entry point. Attach this as an installable "On form submit" trigger; the
 * simple onFormSubmit(e) cannot make external requests, so an installable one is
 * required rather than merely preferred.
 */
function onContactSubmit(e) {
	var props = PropertiesService.getScriptProperties();
	var token = props.getProperty(TOKEN_KEY);
	var chatId = props.getProperty(CHAT_KEY);

	// Thrown rather than logged, so a half-finished setup shows up as a failed
	// execution with an email from Apps Script instead of silently dropping messages.
	if (!token || !chatId) {
		throw new Error('Set ' + TOKEN_KEY + ' and ' + CHAT_KEY + ' in Script Properties first.');
	}

	// namedValues maps each question title to an array of answers, so a question titled
	// "Name" instead of "name" would silently read as empty and you would get a message
	// with everything blank. Keys are folded rather than matched exactly, so the titles
	// only have to be the right words.
	var answers = {};
	var raw = (e && e.namedValues) || {};
	Object.keys(raw).forEach(function (title) {
		answers[String(title).trim().toLowerCase()] = raw[title];
	});

	var field = function (key) {
		return (answers[key] || []).join(' ').trim();
	};

	var text = [
		'Sstreamer: new contact message',
		'',
		'From: ' + (field('name') || '(not given)'),
		'Reply to: ' + (field('reply') || '(not given)'),
		'',
		field('message') || '(empty)',
	].join('\n');

	sendTelegram(token, chatId, text);
}

/**
 * Send one message.
 *
 * Sent as plain text with no parse_mode on purpose. The body is written by a stranger,
 * and under Markdown or HTML parsing an unbalanced `*` or a stray `<` makes Telegram
 * reject the whole message, so a hostile or merely unlucky sender could stop you
 * receiving anything at all.
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
 * Run this once from the editor to prove the token and chat id work, without having
 * to submit the real form. A message arriving in Telegram means setup is complete.
 */
function testTelegram() {
	var props = PropertiesService.getScriptProperties();
	sendTelegram(
		props.getProperty(TOKEN_KEY),
		props.getProperty(CHAT_KEY),
		'Sstreamer: test message. If you can read this, contact notifications work.',
	);
}

/**
 * Run this to find your chat id after messaging the bot once.
 *
 * Doing it here rather than by opening the getUpdates URL in a browser keeps the token
 * out of your browser history, autocomplete, and any sync to another device.
 */
function findChatId() {
	var token = PropertiesService.getScriptProperties().getProperty(TOKEN_KEY);
	if (!token) throw new Error('Set ' + TOKEN_KEY + ' in Script Properties first.');

	var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', {
		muteHttpExceptions: true,
	});
	var updates = JSON.parse(response.getContentText()).result || [];

	if (updates.length === 0) {
		Logger.log('No updates. Send your bot any message in Telegram, then run this again.');
		return;
	}

	updates.forEach(function (update) {
		var chat = (update.message || update.channel_post || {}).chat;
		if (chat) Logger.log('chat id: ' + chat.id + '  (' + (chat.title || chat.first_name) + ')');
	});
}
