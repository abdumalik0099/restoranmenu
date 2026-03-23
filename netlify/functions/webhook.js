// netlify/functions/webhook.js
// Hech qanday npm package kerak emas!

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

  // Tugma bosildi
  const cq = body.callback_query;
  if (!cq) return { statusCode: 200, body: 'OK' };

  const cbId    = cq.id;
  const chatId  = cq.message?.chat?.id;
  const msgId   = cq.message?.message_id;
  const data    = cq.data || '';
  const origText = cq.message?.text || '';

  // ── QABUL QILISH ──────────────────────────────────────
  if (data.startsWith('accept_')) {
    // format: accept_PHONE_orderID
  const parts = data.replace('accept_', '').split('_order_');
  const phone = parts[0];
  const orderId = parts[1] ? 'order_' + parts[1] : '';

    // Xabarni yangilaymiz: qabul + tel tugmasi qoladi
    await tg('editMessageText', {
      chat_id:    chatId,
      message_id: msgId,
      text:       origText + '\n\n✅ <b>QABUL QILINDI</b>',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          // Rad etish yo'qoldi, faqat Tel qilish qoldi
          { text: '📞 Tel qilish', url: 'tel:+' + phone.replace(/[^0-9]/g, '') }
        ]]
      }
    });

    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '✅ Zakaz qabul qilindi!',
      show_alert: false,
    });
    return { statusCode: 200, body: 'OK' };
  }

  // ── RAD ETISH ──────────────────────────────────────────
  if (data.startsWith('reject_')) {
    // format: reject_PHONE_orderID  
  const parts = data.replace('reject_', '').split('_order_');
  const phone = parts[0];
  const orderId = parts[1] ? 'order_' + parts[1] : '';

    // Xabarni yangilaymiz: rad + qabul + tel tugmalari
    // Qabul tugmasi qoladi (adashib bosib yuborsa ham ishlaydi)
    await tg('editMessageText', {
      chat_id:    chatId,
      message_id: msgId,
      text:       origText + '\n\n❌ <b>RAD ETILDI</b>',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          // Rad etish yo'qoldi, faqat Qabul + Tel qoldi
          { text: '✅ Qabul qilish', callback_data: `accept_${phone}` },
          { text: '📞 Tel qilish',   url: 'tel:+' + phone.replace(/[^0-9]/g, '') }
        ]]
      }
    });

    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '❌ Zakaz rad etildi.',
      show_alert: false,
    });
    return { statusCode: 200, body: 'OK' };
  }

  // Noma'lum callback
  await tg('answerCallbackQuery', { callback_query_id: cbId, text: '' });
  return { statusCode: 200, body: 'OK' };
};
