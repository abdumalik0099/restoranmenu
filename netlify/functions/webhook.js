/// netlify/functions/webhook.js
// firebase-admin yo'q — Firestore REST API ishlatamiz
// Hech qanday npm package shart emas!

const BOT_TOKEN        = process.env.BOT_TOKEN;        // Netlify env vars
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT; // masalan: menyu-cc1ad

// ─── Telegram API ────────────────────────────────────
async function tg(method, data) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  return res.json();
}

// ─── Firestore REST (public rules: allow read, write: if true) ───
async function fsGet(col, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${col}/${id}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fsPatch(col, id, fields) {
  const fsFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string')  fsFields[k] = { stringValue: v };
    if (typeof v === 'number')  fsFields[k] = { integerValue: String(v) };
    if (typeof v === 'boolean') fsFields[k] = { booleanValue: v };
  }
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url  = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${col}/${id}?${mask}`;
  const res  = await fetch(url, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields: fsFields }),
  });
  return res.json();
}

// ─── MAIN ────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'OK' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 200, body: 'Bad JSON' }; }

  // /start
  if (body.message?.text === '/start') {
    await tg('sendMessage', {
      chat_id:    body.message.chat.id,
      text:       '🍽️ <b>MenuPost Bot</b>\n\nBuurtmalar shu yerga tushadi.\nTugmalarni bosib qabul yoki rad qiling.',
      parse_mode: 'HTML',
    });
    return { statusCode: 200, body: 'OK' };
  }

  // Tugma bosildi
  const cq = body.callback_query;
  if (!cq) return { statusCode: 200, body: 'OK' };

  const cbId     = cq.id;
  const chatId   = cq.message?.chat?.id;
  const msgId    = cq.message?.message_id;
  const data     = cq.data || '';
  const origText = cq.message?.text || '';

  let action, orderId;
  if      (data.startsWith('accept_')) { action = 'accepted'; orderId = data.replace('accept_', ''); }
  else if (data.startsWith('reject_')) { action = 'rejected'; orderId = data.replace('reject_', ''); }
  else {
    await tg('answerCallbackQuery', { callback_query_id: cbId, text: "Noma'lum buyruq" });
    return { statusCode: 200, body: 'OK' };
  }

  const emoji   = action === 'accepted' ? '✅' : '❌';
  const statusUz = action === 'accepted' ? 'ҚАБУЛ ҚИЛИНДИ' : 'РАД ЭТИЛДИ';
  const alertTxt = action === 'accepted' ? '✅ Zakazni qabul qildingiz!' : '❌ Zakazni rad etdingiz';

  try {
    // 1. Firestore — allaqachon hal qilinganmi?
    if (FIREBASE_PROJECT) {
      const doc = await fsGet('orders', orderId);
      if (doc?.fields) {
        const cur = doc.fields.status?.stringValue;
        if (cur && cur !== 'pending') {
          const msg = cur === 'accepted' ? '✅ Allaqachon qabul qilingan' : '❌ Allaqachon rad etilgan';
          await tg('answerCallbackQuery', { callback_query_id: cbId, text: msg, show_alert: true });
          return { statusCode: 200, body: 'OK' };
        }
        await fsPatch('orders', orderId, { status: action, updatedAt: Date.now() });
      }
    }

    // 2. Xabardagi tugmalarni o'chiramiz + status qo'shamiz
    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   msgId,
      text:         origText + `\n\n${emoji} <b>${statusUz}</b>`,
      parse_mode:   'HTML',
      reply_markup: { inline_keyboard: [] },
    });

    // 3. Qo'shimcha notification
    await tg('sendMessage', {
      chat_id:    chatId,
      text:       alertTxt,
      parse_mode: 'HTML',
    });

    // 4. Tugmadagi "yuklanyapti" ni o'chiramiz
    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text:              alertTxt,
      show_alert:        false,
    });

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Webhook error:', err.message);
    try { await tg('answerCallbackQuery', { callback_query_id: cbId, text: '⚠️ Xato yuz berdi' }); } catch (_) {}
    return { statusCode: 200, body: 'Error handled' };
  }
};
