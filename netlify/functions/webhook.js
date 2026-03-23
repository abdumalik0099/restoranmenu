// netlify/functions/webhook.js
const BOT_TOKEN        = process.env.BOT_TOKEN;
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT || 'menyu-cc1ad';

async function tg(method, data) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function updateOrder(orderId, fields) {
  const fieldMap = {};
  for(const [k,v] of Object.entries(fields)){
    if(typeof v === 'string') fieldMap[k] = { stringValue: v };
    if(typeof v === 'number') fieldMap[k] = { integerValue: String(v) };
  }
  const keys = Object.keys(fields).map(k=>'updateMask.fieldPaths='+k).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/orders/${orderId}?${keys}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fieldMap })
  });
  return res.json();
}

const REJECT_REASONS = [
  { text: '🍽 Таом тугаган',        key: 'food_out'  },
  { text: '🚪 Ресторан ёпилган',    key: 'closed'    },
  { text: '⏳ Жуда кўп заказ бор',  key: 'busy'      },
  { text: '📍 Манзил узоқ',         key: 'far'       },
  { text: '✏️ Бошқа сабаб',         key: 'other'     },
];

const REASON_LABELS = {
  food_out: 'Таом тугаган',
  closed:   'Ресторан ёпилган',
  busy:     'Жуда кўп заказ бор',
  far:      'Манзил узоқ',
  other:    'Бошқа сабаб',
};

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
  // origText — faqat YANGI ZAKAZ qismini olamiz (status qo'shilmagan)
  const fullText  = cq.message.text || '';
  // Eski status qatorlarini olib tashlaymiz (agar avval bosilgan bo'lsa)
  const cleanText = fullText
    .replace(/\n\n✅ ҚАБУЛ ҚИЛИНДИ.*/s, '')
    .replace(/\n\n❌ РАД ЭТИЛДИ.*/s, '')
    .replace(/\n\n⚠️ Рад этиш сабабини танланг:.*/s, '')
    .trim();

  // ── ACCEPT ──
  if (data.startsWith('accept_')) {
    const wp = data.replace('accept_', '');
    const oi = wp.indexOf('_order_');
    const orderId = oi >= 0 ? wp.slice(oi + 1) : wp;

    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   messageId,
      text:         cleanText + '\n\n✅ ҚАБУЛ ҚИЛИНДИ',
      parse_mode:   'HTML',
      reply_markup: { inline_keyboard: [] }
    });
    await tg('answerCallbackQuery', { callback_query_id: cbId, text: '✅ Qabul qilindi!' });
    try { await updateOrder(orderId, { status: 'accepted', updatedAt: Date.now() }); }
    catch(e) { console.warn(e.message); }
    return { statusCode: 200, body: 'OK' };
  }

  // ── REJECT — sabablarni ko'rsat ──
  if (data.startsWith('reject_')) {
    const wp = data.replace('reject_', '');
    const oi = wp.indexOf('_order_');
    const orderId = oi >= 0 ? wp.slice(oi + 1) : wp;

    const keyboard = {
      inline_keyboard: REJECT_REASONS.map(r => ([{
        text: r.text,
        callback_data: `rsn_${r.key}__${orderId}`
      }]))
    };

    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   messageId,
      text:         cleanText + '\n\n⚠️ Рад этиш сабабини танланг:',
      parse_mode:   'HTML',
      reply_markup: keyboard
    });
    await tg('answerCallbackQuery', { callback_query_id: cbId, text: 'Сабабни танланг 👇' });
    return { statusCode: 200, body: 'OK' };
  }

  // ── REASON selected ──
  if (data.startsWith('rsn_')) {
    // format: rsn_KEY__orderId
    const parts   = data.replace('rsn_', '').split('__');
    const key     = parts[0];
    const orderId = parts[1];
    const reason  = REASON_LABELS[key] || 'Бошқа сабаб';

    await tg('editMessageText', {
      chat_id:      chatId,
      message_id:   messageId,
      text:         cleanText + '\n\n❌ РАД ЭТИЛДИ\n📝 Сабаб: ' + reason,
      parse_mode:   'HTML',
      reply_markup: { inline_keyboard: [] }
    });
    await tg('answerCallbackQuery', { callback_query_id: cbId, text: '❌ ' + reason });
    try {
      await updateOrder(orderId, {
        status:       'rejected',
        rejectReason: reason,
        updatedAt:    Date.now()
      });
    } catch(e) { console.warn(e.message); }
    return { statusCode: 200, body: 'OK' };
  }

  await tg('answerCallbackQuery', { callback_query_id: cbId, text: '' });
  return { statusCode: 200, body: 'OK' };
};