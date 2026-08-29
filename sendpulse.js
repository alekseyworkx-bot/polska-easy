#!/usr/bin/env node
/* Мінімальний CLI для SendPulse Chatbots API (без залежностей, Node >= 18).
   Ключі беруться з .env: SENDPULSE_API_ID / SENDPULSE_API_SECRET.
   Токен кешується у .sendpulse-token.json (у .gitignore).

   Приклади:
     node sendpulse.js token
     node sendpulse.js bots
     node sendpulse.js flows                 # флоу всіх ботів
     node sendpulse.js flows <botId>         # флоу конкретного бота
     node sendpulse.js raw GET /chatbots/bots
     node sendpulse.js raw POST /telegram/flows/run '{"contact_id":"...","flow_id":"..."}'
*/
'use strict';

const fs = require('fs');
const path = require('path');

const API = 'https://api.sendpulse.com';
const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
const TOKEN_FILE = path.join(ROOT, '.sendpulse-token.json');

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

function creds() {
  loadEnv();
  const id = process.env.SENDPULSE_API_ID;
  const secret = process.env.SENDPULSE_API_SECRET;
  if (!id || !secret) {
    throw new Error('Немає SENDPULSE_API_ID / SENDPULSE_API_SECRET (перевірте .env)');
  }
  return { id, secret };
}

async function fetchToken() {
  const { id, secret } = creds();
  const res = await fetch(`${API}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`oauth ${res.status}: ${text}`);
  const data = JSON.parse(text);
  if (!data.access_token) throw new Error(`oauth без access_token: ${text}`);
  const cached = {
    access_token: data.access_token,
    token_type: data.token_type || 'Bearer',
    expires_at: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000,
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(cached, null, 2));
  return cached;
}

async function getToken({ force = false } = {}) {
  if (!force && fs.existsSync(TOKEN_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (cached.access_token && cached.expires_at > Date.now()) return cached;
    } catch { /* кеш зіпсований — беремо новий */ }
  }
  return fetchToken();
}

async function api(method, endpoint, body) {
  let token = await getToken();
  const call = async (tk) => {
    const res = await fetch(API + (endpoint.startsWith('/') ? endpoint : '/' + endpoint), {
      method,
      headers: {
        Authorization: `${tk.token_type} ${tk.access_token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  };
  let r = await call(token);
  if (r.status === 401) {           // токен протух — оновлюємо один раз
    token = await getToken({ force: true });
    r = await call(token);
  }
  let parsed;
  try { parsed = JSON.parse(r.text); } catch { parsed = r.text; }
  if (r.status >= 400) {
    const err = new Error(`${method} ${endpoint} → ${r.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
    err.status = r.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

const unwrap = (r) => (r && typeof r === 'object' && 'data' in r ? r.data : r);

// ── команди ───────────────────────────────────────────────────────────────
async function cmdToken() {
  const t = await fetchToken();
  console.log(`access_token: ${t.access_token.slice(0, 12)}… (довжина ${t.access_token.length})`);
  console.log(`дійсний до:   ${new Date(t.expires_at).toISOString()}`);
  console.log(`збережено в:  ${path.relative(process.cwd(), TOKEN_FILE)}`);
}

async function listBots() {
  return unwrap(await api('GET', '/chatbots/bots')) || [];
}

async function cmdBots(json) {
  const bots = await listBots();
  if (json) return console.log(JSON.stringify(bots, null, 2));
  if (!bots.length) return console.log('Ботів не знайдено.');
  console.log(`Ботів: ${bots.length}\n`);
  for (const b of bots) {
    const name = b.name || b.channel_data?.name || b.channel_data?.first_name || '(без назви)';
    console.log(`• ${name}`);
    console.log(`    id:       ${b.id}`);
    console.log(`    канал:    ${b.channel || '—'}`);
    if (b.channel_data?.username) console.log(`    username: @${b.channel_data.username}`);
    if (b.status !== undefined) console.log(`    статус:   ${b.status}`);
    if (b.inbox?.unread !== undefined) console.log(`    непрочит.: ${b.inbox.unread}`);
    console.log();
  }
}

async function cmdFlows(botId, json) {
  const bots = botId ? [{ id: botId, name: botId }] : await listBots();
  const out = [];
  for (const b of bots) {
    let flows = [];
    try {
      flows = unwrap(await api('GET', `/chatbots/flows?bot_id=${encodeURIComponent(b.id)}`)) || [];
    } catch (e) {
      out.push({ bot: b, error: e.message });
      continue;
    }
    out.push({ bot: b, flows });
  }
  if (json) return console.log(JSON.stringify(out, null, 2));
  for (const item of out) {
    const name = item.bot.name || item.bot.channel_data?.name || item.bot.id;
    console.log(`▸ Бот «${name}» (${item.bot.id})`);
    if (item.error) { console.log(`    помилка: ${item.error}\n`); continue; }
    if (!item.flows.length) { console.log('    флоу немає\n'); continue; }
    for (const f of item.flows) {
      console.log(`    – ${f.name || '(без назви)'}  [id: ${f.id}]${f.status !== undefined ? `  статус: ${f.status}` : ''}`);
      if (f.trigger?.type) console.log(`        тригер: ${f.trigger.type}${f.trigger.keywords ? ` (${f.trigger.keywords})` : ''}`);
    }
    console.log();
  }
}

async function cmdRaw(method, endpoint, bodyStr) {
  const body = bodyStr ? JSON.parse(bodyStr) : undefined;
  console.log(JSON.stringify(await api(method.toUpperCase(), endpoint, body), null, 2));
}

const USAGE = `Використання:
  node sendpulse.js token                      — отримати/оновити access_token
  node sendpulse.js bots [--json]              — список чат-ботів
  node sendpulse.js flows [botId] [--json]     — список флоу (усіх ботів або одного)
  node sendpulse.js raw <METHOD> <path> [json] — довільний запит до API`;

(async () => {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  const cmd = args[0];
  try {
    switch (cmd) {
      case 'token': await cmdToken(); break;
      case 'bots':  await cmdBots(json); break;
      case 'flows': await cmdFlows(args[1], json); break;
      case 'raw':
        if (args.length < 3) throw new Error('raw потребує <METHOD> <path>');
        await cmdRaw(args[1], args[2], args[3]);
        break;
      default:
        console.log(USAGE);
        process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error('Помилка: ' + e.message);
    process.exit(1);
  }
})();
