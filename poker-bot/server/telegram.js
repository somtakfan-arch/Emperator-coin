// Telegram: Bot API, проверка подписи мини-аппа, приём платежей звёздами.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { db, tx, upsertUser, credit, getUser } from './db.js';

export const bot = { username: '' };

export async function api(method, params = {}) {
  if (!config.botToken) throw new Error('BOT_TOKEN не задан');
  const r = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

// Проверка initData из Telegram.WebApp — так сервер точно знает, кто играет.
export function verifyInitData(initData) {
  if (!initData || !config.botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const calc = createHmac('sha256', secret).update(check).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== calc.length || !timingSafeEqual(given, calc)) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date')) > 86400) return null;
  try {
    return { user: JSON.parse(params.get('user')), startParam: params.get('start_param') };
  } catch {
    return null;
  }
}

// ---------- Сообщения ----------

// style: 'success' — зелёная, 'primary' — синяя, 'danger' — красная (Bot API 9.4+)
const appButton = (text, path = '', style) => ({ text, web_app: { url: config.webAppUrl + path }, ...(style ? { style } : {}) });

export function notify(userId, text, button = null) {
  if (config.dev || !config.botToken) return;
  api('sendMessage', {
    chat_id: userId, text, parse_mode: 'HTML',
    reply_markup: button ? { inline_keyboard: [[button]] } : undefined,
  }).catch(() => {});
}
export const openButton = (text, path, style = 'primary') => appButton(text, path, style);

export const inviteLink = (tId) => `https://t.me/${bot.username}?start=t_${tId}`;

// ---------- Платежи звёздами ----------

export async function createInvoice(userId, packId) {
  const pack = config.packs.find((p) => p.id === packId);
  if (!pack) throw new Error('нет такого пакета');
  return api('createInvoiceLink', {
    title: `${pack.chips.toLocaleString('ru')} фишек`,
    description: 'Игровые фишки для покера. Фишки нельзя вывести или обменять на деньги.',
    payload: JSON.stringify({ u: userId, p: pack.id }),
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Фишки', amount: pack.stars }],
  });
}

function onPayment(msg) {
  const sp = msg.successful_payment;
  let payload;
  try { payload = JSON.parse(sp.invoice_payload); } catch { return; }
  const pack = config.packs.find((p) => p.id === payload.p);
  if (!pack || sp.currency !== 'XTR') return;
  const userId = msg.from.id;
  upsertUser(msg.from);
  const done = tx(() => {
    const r = db.prepare('INSERT OR IGNORE INTO payments (charge_id, user_id, stars, chips, pack, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sp.telegram_payment_charge_id, userId, sp.total_amount, pack.chips, pack.id, Date.now());
    return r.changes > 0;
  });
  if (!done) return; // повтор того же платежа
  credit(userId, pack.chips, 'stars', sp.telegram_payment_charge_id);
  hooks.onBalance?.(userId);
  notify(userId, `Зачислено <b>${pack.chips.toLocaleString('ru')}</b> фишек. Удачной игры!`, appButton('Играть', '', 'success'));
}

// ---------- Команды ----------

const TEXT = {
  start: '<b>Покер</b>\n\nХолдем против ботов или живых людей: столы, свои турниры и Большой турнир каждый день в 00:00 по Москве.\n\nФишки покупаются за звёзды прямо в приложении.',
  paysupport: 'Вопросы по оплате: напиши сюда, в этот чат, номер платежа из чека — разберёмся.\n\nФишки — игровая валюта. Их нельзя вывести или обменять на деньги.',
  terms: 'Условия: фишки — игровая валюта без денежной стоимости, вывода нет. Покупка фишек за звёзды — покупка цифрового товара. Играя, ты соглашаешься с этим.',
};

async function onMessage(msg) {
  if (msg.successful_payment) return onPayment(msg);
  const text = msg.text || '';
  const chat = msg.chat.id;
  if (msg.from) upsertUser(msg.from);
  if (text.startsWith('/start')) {
    const arg = text.split(' ')[1] || '';
    const tId = arg.startsWith('t_') ? arg.slice(2).replace(/[^a-zA-Z0-9]/g, '') : '';
    if (tId) {
      const t = db.prepare('SELECT name FROM tournaments WHERE id = ?').get(tId);
      if (t) {
        return api('sendMessage', {
          chat_id: chat, parse_mode: 'HTML',
          text: `Тебя позвали в турнир <b>${escapeHtml(t.name)}</b>`,
          reply_markup: { inline_keyboard: [[appButton('Открыть турнир', `#t=${tId}`, 'success')]] },
        });
      }
    }
    return api('sendMessage', {
      chat_id: chat, text: TEXT.start, parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [appButton('Играть', '', 'success'), appButton('Турниры', '#tournaments', 'primary')],
          [appButton('Пополнить', '#wallet', 'primary'), { text: 'Правила', callback_data: 'terms' }],
        ],
      },
    });
  }
  if (text.startsWith('/paysupport')) return api('sendMessage', { chat_id: chat, text: TEXT.paysupport });
  if (text.startsWith('/terms')) return api('sendMessage', { chat_id: chat, text: TEXT.terms });
  if (config.adminIds.includes(msg.from?.id)) return onAdmin(msg);
}

// Найти игрока по id или @username
function findUser(ref) {
  if (!ref) return null;
  if (/^\d+$/.test(ref)) return getUser(Number(ref));
  return db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(ref.replace(/^@/, ''));
}

const ADMIN_HELP = [
  'Команды админа:',
  '/give <id или @ник> <фишки> — выдать фишки (минус — забрать)',
  '/elo <id или @ник> <число> — поставить Эло; +50 / -30 — изменить',
  '/user <id или @ник> — инфо об игроке',
  '/stats — общая статистика',
  '/refund <id платежа> — вернуть звёзды',
].join('\n');

async function onAdmin(msg) {
  const [cmd, arg, arg2] = (msg.text || '').split(/\s+/);
  const reply = (text) => api('sendMessage', { chat_id: msg.chat.id, text });
  if (cmd === '/admin' || cmd === '/help') return reply(ADMIN_HELP);
  if (cmd === '/give' || cmd === '/elo' || cmd === '/user') {
    const u = findUser(arg);
    if (!u) return reply('Игрок не найден. Он должен хотя бы раз нажать /start или открыть приложение.');
    const who = `${u.name}${u.username ? ` (@${u.username})` : ''}, id ${u.id}`;
    if (cmd === '/user') {
      return reply(`${who}\nФишки: ${u.chips} (в игре ${u.in_play})\nЭло: ${Math.round(u.rating)}\nТурниров: ${u.games}, побед: ${u.wins}`);
    }
    if (cmd === '/give') {
      const amount = Math.trunc(Number(arg2));
      if (!amount) return reply('Пример: /give @nick 5000 или /give 123456 -1000');
      let delta = amount;
      tx(() => {
        if (amount < 0) delta = -Math.min(u.chips, -amount);
        db.prepare('UPDATE users SET chips = chips + ? WHERE id = ?').run(delta, u.id);
        db.prepare('INSERT INTO ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)').run(u.id, delta, 'admin', String(msg.from.id), Date.now());
      });
      hooks.onBalance?.(u.id);
      if (delta > 0) notify(u.id, `Тебе начислено <b>${delta.toLocaleString('ru')}</b> фишек!`, appButton('Играть', '', 'success'));
      return reply(`${who}: ${delta >= 0 ? '+' : ''}${delta} фишек, теперь ${u.chips + delta}`);
    }
    const m = /^([+-]?)(\d+)$/.exec(arg2 || '');
    if (!m) return reply('Пример: /elo @nick 1800 или /elo @nick +50');
    const val = Number(m[2]);
    const rating = Math.max(0, m[1] === '+' ? u.rating + val : m[1] === '-' ? u.rating - val : val);
    db.prepare('UPDATE users SET rating = ? WHERE id = ?').run(rating, u.id);
    hooks.onBalance?.(u.id);
    return reply(`${who}: Эло ${Math.round(u.rating)} → ${Math.round(rating)}`);
  }
  if (cmd === '/stats') {
    const s = db.prepare('SELECT COUNT(*) AS users, SUM(chips + in_play) AS chips FROM users').get();
    const p = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stars), 0) AS stars FROM payments WHERE refunded = 0').get();
    return reply(`Игроков: ${s.users}\nФишек у игроков: ${s.chips ?? 0}\nПлатежей: ${p.n}, звёзд: ${p.stars}`);
  }
  if (cmd === '/refund' && arg) {
    const pay = db.prepare('SELECT * FROM payments WHERE charge_id = ?').get(arg);
    if (!pay || pay.refunded) return reply('Платёж не найден или уже возвращён');
    await api('refundStarPayment', { user_id: pay.user_id, telegram_payment_charge_id: pay.charge_id });
    tx(() => {
      db.prepare('UPDATE payments SET refunded = 1 WHERE charge_id = ?').run(arg);
      const u = getUser(pay.user_id);
      const take = Math.min(u.chips, pay.chips);
      db.prepare('UPDATE users SET chips = chips - ? WHERE id = ?').run(take, pay.user_id);
      db.prepare('INSERT INTO ledger (user_id, delta, reason, ref, at) VALUES (?, ?, ?, ?, ?)').run(pay.user_id, -take, 'refund', arg, Date.now());
    });
    hooks.onBalance?.(pay.user_id);
    return reply(`Возвращено ${pay.stars} звёзд, списано до ${pay.chips} фишек`);
  }
}

export const hooks = { onBalance: null };

// ---------- Long polling ----------

export async function startBot() {
  const me = await api('getMe');
  bot.username = me.username;
  await api('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть покер' },
      { command: 'paysupport', description: 'Помощь с оплатой' },
      { command: 'terms', description: 'Условия' },
    ],
  });
  for (const id of config.adminIds) {
    await api('setMyCommands', {
      scope: { type: 'chat', chat_id: id },
      commands: [
        { command: 'start', description: 'Открыть покер' },
        { command: 'give', description: 'Выдать фишки: /give @ник 5000' },
        { command: 'elo', description: 'Эло: /elo @ник 1800 или +50' },
        { command: 'user', description: 'Инфо об игроке' },
        { command: 'stats', description: 'Статистика' },
        { command: 'admin', description: 'Все команды админа' },
      ],
    }).catch((e) => console.error('admin commands:', e.message));
  }
  if (config.webAppUrl) {
    await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Покер', web_app: { url: config.webAppUrl } } });
  }
  console.log(`Бот @${bot.username} запущен`);
  let offset = 0;
  for (;;) {
    try {
      const updates = await api('getUpdates', {
        offset, timeout: 30, allowed_updates: ['message', 'pre_checkout_query', 'callback_query'],
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.message) await onMessage(u.message);
          else if (u.pre_checkout_query) await onPreCheckout(u.pre_checkout_query);
          else if (u.callback_query) {
            await api('answerCallbackQuery', { callback_query_id: u.callback_query.id });
            if (u.callback_query.data === 'terms') await api('sendMessage', { chat_id: u.callback_query.from.id, text: TEXT.terms });
          }
        } catch (e) {
          console.error('update error', e.message);
        }
      }
    } catch (e) {
      console.error('getUpdates', e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function onPreCheckout(pq) {
  let ok = false;
  try {
    const p = JSON.parse(pq.invoice_payload);
    const pack = config.packs.find((x) => x.id === p.p);
    ok = !!pack && pq.currency === 'XTR' && pq.total_amount === pack.stars && p.u === pq.from.id;
  } catch {}
  await api('answerPreCheckoutQuery', ok
    ? { pre_checkout_query_id: pq.id, ok: true }
    : { pre_checkout_query_id: pq.id, ok: false, error_message: 'Пакет устарел, открой магазин заново' });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
