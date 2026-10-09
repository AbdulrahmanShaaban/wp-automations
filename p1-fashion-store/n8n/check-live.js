// check-live.js — Phase 5 live-readiness check (owner-side, no n8n needed).
//
//   node n8n/check-live.js            → check what is in n8n/.env
//   node n8n/check-live.js --new-secret → print a fresh WOO_WEBHOOK_SECRET
//
// Never prints a secret value; only whether it is present / valid.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_PATH = path.join(__dirname, '.env');

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function getJson(url) {
  return fetch(url, { method: 'GET' }).then(
    (r) => r.json().catch(() => ({ ok: false, description: 'http ' + r.status })),
    (e) => ({ ok: false, description: e.message })
  );
}

const GREEN = '  PASS';
const RED = '  FAIL';
const HINT = '  TODO';
let failures = 0;
const step = (state, label, detail) => {
  if (state === 'fail') failures += 1;
  const tag = state === 'pass' ? GREEN : state === 'fail' ? RED : HINT;
  console.log(tag + ': ' + label + (detail ? '  — ' + detail : ''));
};

async function main() {
  if (process.argv.includes('--new-secret')) {
    console.log(crypto.randomBytes(24).toString('hex'));
    console.log('paste into n8n/.env as WOO_WEBHOOK_SECRET=');
    return 0;
  }

  if (process.argv.includes('--learn-chat-id')) {
    return learnChatId();
  }

  if (!fs.existsSync(ENV_PATH)) {
    console.log('no file: ' + ENV_PATH);
    console.log('create it from the template:  cp n8n/.env.example n8n/.env  (or copy it in Notepad)');
    return 1;
  }

  const env = parseEnv(ENV_PATH);
  const keys = Object.keys(env);
  console.log('n8n/.env found — ' + keys.length + ' keys set\n');

  // 1. Telegram token
  let botUser = '';
  let tokenValid = false;
  if (!env.TELEGRAM_BOT_TOKEN) {
    step('todo', 'TELEGRAM_BOT_TOKEN', 'missing — create the bot with @BotFather');
  } else {
    const me = await getJson('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/getMe');
    if (me && me.ok) {
      tokenValid = true;
      botUser = '@' + me.result.username;
      step('pass', 'TELEGRAM_BOT_TOKEN', 'valid, bot is ' + botUser);
    } else {
      const why = (me && me.description) || 'unknown error';
      step('fail', 'TELEGRAM_BOT_TOKEN', why + ' — copy the token again from @BotFather');
    }
  }

  // 2. Telegram chat id
  if (!env.TELEGRAM_CHAT_ID) {
    step('todo', 'TELEGRAM_CHAT_ID', 'missing — message ' + (botUser || 'your bot') + ' then use @userinfobot');
  } else if (!tokenValid) {
    step('todo', 'TELEGRAM_CHAT_ID', 'set — cannot be verified until the token above is valid');
  } else {
    const chat = await getJson(
      'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/getChat?chat_id=' + encodeURIComponent(env.TELEGRAM_CHAT_ID)
    );
    if (chat && chat.ok) {
      step('pass', 'TELEGRAM_CHAT_ID', 'chat ' + (chat.result.title || chat.result.username || chat.result.id));
    } else if (chat && chat.description && chat.description.indexOf('not found') !== -1) {
      step('fail', 'TELEGRAM_CHAT_ID', 'bot cannot see this chat — send /start to ' + botUser + ' first');
    } else {
      step('fail', 'TELEGRAM_CHAT_ID', (chat && chat.description) || 'unknown error');
    }
  }

  // 3. Webhook secret
  if (!env.WOO_WEBHOOK_SECRET) {
    step('todo', 'WOO_WEBHOOK_SECRET', 'missing — run: node n8n/check-live.js --new-secret');
  } else if (env.WOO_WEBHOOK_SECRET.length < 16) {
    step('fail', 'WOO_WEBHOOK_SECRET', 'too short (' + env.WOO_WEBHOOK_SECRET.length + ' chars) — use --new-secret');
  } else {
    step('pass', 'WOO_WEBHOOK_SECRET', 'set, ' + env.WOO_WEBHOOK_SECRET.length + ' chars');
  }

  // 4. Google Sheet (id + the credential picked inside n8n — only the first is checkable here)
  if (!env.GOOGLE_SHEET_ID) {
    step('todo', 'GOOGLE_SHEET_ID', 'missing — upload n8n/order-log-template.csv to sheets.new');
  } else {
    step('pass', 'GOOGLE_SHEET_ID', 'set — also pick the Google credential inside the F1 node');
    const gid = env.GOOGLE_SHEET_GID;
    if (!gid) {
      step('todo', 'GOOGLE_SHEET_GID', 'not set — copy the #gid=<N> value from the sheet URL (tab is selected by id)');
    } else if (!/^\d+$/.test(String(gid))) {
      step('fail', 'GOOGLE_SHEET_GID', 'must be the numeric gid from the URL, got: "' + gid + '"');
    } else {
      step('pass', 'GOOGLE_SHEET_GID', gid);
    }
  }

  // 5. Store API keys
  const wooOk = Boolean(env.WC_API_KEY && env.WC_API_SECRET);
  if (wooOk) {
    step('pass', 'WC_API_KEY / WC_API_SECRET', 'both set (F3/F4/F5/F6 read orders from the store)');
  } else {
    step('todo', 'WC_API_KEY / WC_API_SECRET', 'missing — needed for F3/F4/F5/F6 (F1/F2 webhooks do not use them)');
  }

  // 6. Tuning values are sane
  const tuning = [
    ['PENDING_HOURS', env.PENDING_HOURS, 48],
    ['LOW_STOCK_QTY', env.LOW_STOCK_QTY, 5],
    ['REVIEW_AFTER_DAYS', env.REVIEW_AFTER_DAYS, 5],
  ];
  for (const [name, raw, fallback] of tuning) {
    if (raw === undefined || raw === '') {
      step('todo', name, 'not set — n8n will use the built-in default ' + fallback);
    } else if (!Number.isFinite(Number(raw)) || Number(raw) <= 0) {
      step('fail', name, 'not a positive number: "' + raw + '"');
    } else {
      step('pass', name, raw);
    }
  }

  console.log('');
  if (failures === 0) {
    console.log('no problems found — start n8n, import the workflows, and attach the Error Workflow.');
  } else {
    console.log(failures + ' problem(s) above — fix them, then run this again.');
  }
  return 0;
}

// Reads the bot's pending updates (getUpdates) and reports the chat ids that
// already wrote to it — that replaces the @userinfobot step. If exactly one
// distinct chat is found, its id is written into n8n/.env (flag = explicit
// intent to change the file).
async function learnChatId() {
  const env = parseEnv(ENV_PATH);
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN missing in n8n/.env — add it first.');
    return 1;
  }
  const res = await getJson(
    'https://api.telegram.org/bot' + token + '/getUpdates?limit=100&timeout=0'
  );
  if (!res || !res.ok) {
    const why = (res && res.description) || 'unknown error';
    console.log('getUpdates failed: ' + why);
    if (why.indexOf('webhook') !== -1) {
      console.log('the bot already has a webhook set — unset it, or read the id from @userinfobot.');
    }
    return 1;
  }
  const chats = new Map();
  for (const u of res.result || []) {
    const msg = u.message || u.edited_message || u.channel_post;
    if (!msg || !msg.chat) continue;
    const id = msg.chat.id;
    if (!chats.has(id)) {
      chats.set(id, {
        id,
        type: msg.chat.type,
        title: msg.chat.title || null,
        username: (msg.from && msg.from.username) || null,
        name: [msg.from && msg.from.first_name, msg.from && msg.from.last_name]
          .filter(Boolean)
          .join(' ') || null,
        text: String((msg.text || '')).slice(0, 60),
      });
    }
  }
  if (chats.size === 0) {
    console.log('no messages yet — open t.me/nilad_notify_bot and press Start (or send /start), then run this again.');
    return 1;
  }
  console.log('chats that already wrote to the bot:');
  for (const c of chats.values()) {
    console.log(
      '  ' + c.id + '  [' + c.type + ']' +
        (c.username ? '  @' + c.username : '') +
        (c.title ? '  ' + c.title : '') +
        (c.name ? '  ' + c.name : '') +
        (c.text ? '  "' + c.text + '"' : '')
    );
  }
  if (chats.size === 1) {
    const id = String(chats.keys().next().value);
    const line = fs.readFileSync(ENV_PATH, 'utf8');
    const updated = /^TELEGRAM_CHAT_ID=.*$/m.test(line)
      ? line.replace(/^TELEGRAM_CHAT_ID=.*$/m, 'TELEGRAM_CHAT_ID=' + id)
      : line.replace(/\n*$/, '\n') + 'TELEGRAM_CHAT_ID=' + id + '\n';
    fs.writeFileSync(ENV_PATH, updated);
    console.log('\nwritten to n8n/.env:  TELEGRAM_CHAT_ID=' + id);
    console.log('now run:  node n8n/check-live.js   (should be all PASS)');
    return 0;
  }
  console.log('\nmore than one chat — pick the right id and set TELEGRAM_CHAT_ID in n8n/.env yourself.');
  return 0;
}

// NOTE: never call process.exit() here — fetch/undici keeps sockets open and
// forcing an exit aborts Node on Windows (UV_HANDLE_CLOSING assertion). Setting
// process.exitCode lets the runtime shut down cleanly.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error('checker crashed: ' + err.message);
    process.exitCode = 1;
  }
);
