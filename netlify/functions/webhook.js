// netlify/functions/webhook.js
// Netlify Environment Variables:
//   BOT_TOKEN            = бот токени
//   FIREBASE_PROJECT_ID  = menyu-cc1ad
//   FIREBASE_CLIENT_EMAIL = ...
//   FIREBASE_PRIVATE_KEY  = ...

const BOT_TOKEN = process.env.BOT_TOKEN;

async function tg(method, data) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'OK' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 200, body: 'Bad JSON' }; }

  // /start
  if (body.message?.text === '/start') {
    await tg('sendMessage', {
      chat_id: body.message.chat.id,
      text: '🍽️ <b>MenuPost Bot</b>\n\nZakazlar shu yerga tushadi.\nTugmalar orqali boshqaring.',
      parse_mode: 'HTML',
    });
    return { statusCode: 200, body: 'OK' };
  }

  const cq = body.callback_query;
  if (!cq) return { statusCode: 200, body: 'OK' };

  const data      = cq.data || '';
  const chatId    = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const cbId      = cq.id;
  const origText  = cq.message.text || '';

  const isAccept = data.startsWith('accept_');
  const isReject = data.startsWith('reject_');

  if (!isAccept && !isReject) {
    await tg('answerCallbackQuery', { callback_query_id: cbId, text: "Noma'lum buyruq" });
    return { statusCode: 200, body: 'OK' };
  }

  // callback_data format: accept_+998901234567_order_1234567890_abcd
  const withoutPrefix = data.replace(/^(accept_|reject_)/, '');
  const orderIdx = withoutPrefix.indexOf('_order_');
  let phone   = orderIdx >= 0 ? withoutPrefix.slice(0, orderIdx) : '';
  let orderId = orderIdx >= 0 ? withoutPrefix.slice(orderIdx + 1) : withoutPrefix;

  const action     = isAccept ? 'accepted' : 'rejected';
  const statusLine = isAccept ? '✅ ҚАБУЛ ҚИЛИНДИ' : '❌ РАД ЭТИЛДИ';
  const notifText  = isAccept ? '✅ Zakaz qabul qilindi!' : '❌ Zakaz rad etildi';

  // Tel URL — faqat raqamlar
  const telUrl = phone ? 'tel:+' + phone.replace(/[^0-9]/g, '') : null;

  // Tugmalarni yangilaymiz:
  // Qabul: faqat Tel qoladi
  // Rad:   Qabul + Tel qoladi (adashib bosib qabul qila olsin)
  let newKeyboard;
  if (isAccept) {
    newKeyboard = telUrl
      ? { inline_keyboard: [[{ text: '📞 Tel qilish', url: telUrl }]] }
      : { inline_keyboard: [] };
  } else {
    const row = [];
    row.push({
      text: '✅ Қабул қилиш',
      callback_data: 'accept_' + (phone ? phone + '_' : '') + orderId
    });
    if (telUrl) row.push({ text: '📞 Tel qilish', url: telUrl });
    newKeyboard = { inline_keyboard: [row] };
  }

  // 1. Xabarni yangilaymiz
  try {
    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   messageId,
      text:         origText + '\n\n' + statusLine,
      parse_mode:   'HTML',
      reply_markup: newKeyboard,
    });
  } catch (e) {
    console.warn('editMessageText:', e.message);
  }

  // 2. Tugmadagi "yuklanmoqda" ni to'xtatamiz
  try {
    await tg('answerCallbackQuery', { callback_query_id: cbId, text: notifText });
  } catch (e) {
    console.warn('answerCallbackQuery:', e.message);
  }

  // 3. Firestore statusni yangilaymiz
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
    const db  = admin.firestore();
    const ref = db.collection('orders').doc(orderId);
    const snap = await ref.get();
    if (snap.exists && snap.data().status === 'pending') {
      await ref.update({ status: action, updatedAt: Date.now() });
    }
  } catch (e) {
    console.warn('Firestore skipped:', e.message);
  }

  return { statusCode: 200, body: 'OK' };
};