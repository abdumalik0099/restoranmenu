// netlify/functions/webhook.js
// Kerakli env variables:
//   BOT_TOKEN          = telegram bot token
//   FIREBASE_PROJECT   = menyu-cc1ad

const BOT_TOKEN      = process.env.BOT_TOKEN;
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT || 'menyu-cc1ad';

async function tg(method, data) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// Firestore REST API - no Admin SDK needed!
async function updateOrderStatus(orderId, status) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/orders/${orderId}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`;
  
  const body = {
    fields: {
      status:    { stringValue: status },
      updatedAt: { integerValue: String(Date.now()) }
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const json = await res.json();
  console.log('[Firestore PATCH]', JSON.stringify(json).slice(0, 200));
  return json;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'Webhook OK' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 200, body: 'OK' }; }

  const cq = body.callback_query;
  if (!cq) return { statusCode: 200, body: 'OK' };

  const cbId      = cq.id;
  const chatId    = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data      = cq.data || '';
  const origText  = cq.message.text || '';

  const isAccept = data.startsWith('accept_');
  const isReject = data.startsWith('reject_');

  if (!isAccept && !isReject) {
    await tg('answerCallbackQuery', { callback_query_id: cbId, text: '' });
    return { statusCode: 200, body: 'OK' };
  }

  // callback_data: accept_PHONE_order_xxx yoki reject_...
  const withoutPrefix = data.replace(/^(accept_|reject_)/, '');
  const orderIdx = withoutPrefix.indexOf('_order_');
  const phone   = orderIdx >= 0 ? withoutPrefix.slice(0, orderIdx) : '';
  const orderId = orderIdx >= 0 ? withoutPrefix.slice(orderIdx + 1) : withoutPrefix;

  const status = isAccept ? 'accepted' : 'rejected';

  // 1. Telegram xabarni yangilaymiz (darhol)
  if (isAccept) {
    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   messageId,
      text:         origText + '\n\n✅ ҚАБУЛ ҚИЛИНДИ',
      parse_mode:   'HTML',
      reply_markup: { inline_keyboard: [] }
    });
    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '✅ Zakaz qabul qilindi!'
    });
  } else {
    const acceptData = 'accept_' + (phone ? phone + '_' : '') + orderId;
    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   messageId,
      text:         origText + '\n\n❌ РАД ЭТИЛДИ',
      parse_mode:   'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Қабул қилиш', callback_data: acceptData }
        ]]
      }
    });
    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '❌ Zakaz rad etildi'
    });
  }

  // 2. Firestore statusni REST API orqali yangilaymiz
  try {
    await updateOrderStatus(orderId, status);
    console.log(`✅ Order ${orderId} -> ${status}`);
  } catch(e) {
    console.warn('Firestore update error:', e.message);
  }

  return { statusCode: 200, body: 'OK' };
};