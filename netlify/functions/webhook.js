// netlify/functions/webhook.js
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

  // callback_data: accept_PHONE_order_xxx
  const withoutPrefix = data.replace(/^(accept_|reject_)/, '');
  const orderIdx = withoutPrefix.indexOf('_order_');
  const phone   = orderIdx >= 0 ? withoutPrefix.slice(0, orderIdx) : '';
  const orderId = orderIdx >= 0 ? withoutPrefix.slice(orderIdx + 1) : withoutPrefix;

  if (isAccept) {
    // Xabarni to'liq QABUL qilingan matn bilan almashtiramiz
    // Barcha tugmalar o'chadi
    const newText = origText + '\n\n✅ ҚАБУЛ ҚИЛИНДИ';

    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   messageId,
      text:         newText,
      parse_mode:   'HTML',
      reply_markup: { inline_keyboard: [] }
    });

    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '✅ Zakaz qabul qilindi!'
    });
  }

  if (isReject) {
    // Xabarni RAD etilgan matn bilan yangilaymiz
    // Faqat Qabul tugmasi qoladi
    const newText = origText + '\n\n❌ РАД ЭТИЛДИ';

    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   messageId,
      text:         newText,
      parse_mode:   'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '✅ Қабул қилиш',
            callback_data: 'accept_' + (phone ? phone + '_' : '') + orderId
          }
        ]]
      }
    });

    await tg('answerCallbackQuery', {
      callback_query_id: cbId,
      text: '❌ Zakaz rad etildi'
    });
  }

  return { statusCode: 200, body: 'OK' };
};