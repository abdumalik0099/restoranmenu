const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

async function tg(method, data) {
    return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).then(res => res.json());
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'OK' };

    const body = JSON.parse(event.body || '{}');
    console.log("Aynan kelgan ma'lumot:", JSON.stringify(body));

    const cq = body.callback_query;
    if (cq) {
        const data = cq.data; // "accept_order_1773856156913_anlr"
        const chatId = cq.message.chat.id;
        const msgId = cq.message.message_id;

        // Logda ko'ringan dataga moslab tekshiramiz
        const isAccept = data.includes('accept');
        const statusEmoji = isAccept ? "✅" : "❌";
        const statusText = isAccept ? "ҚАБУЛ ҚИЛИНДИ" : "РАД ЭТИЛДИ";

        try {
            // 1. Telegramdagi "aylanish"ni to'xtatish
            await tg('answerCallbackQuery', { 
                callback_query_id: cq.id,
                text: isAccept ? "Zakaz qabul qilindi" : "Zakaz rad etildi"
            });

            // 2. Xabar matnini yangilash va tugmalarni o'chirish
            const updatedText = cq.message.text + `\n\n${statusEmoji} <b>STATUS: ${statusText}</b>`;
            
            await tg('editMessageText', {
                chat_id: chatId,
                message_id: msgId,
                text: updatedText,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] } // Tugmalarni o'chiradi
            });

            console.log("Xabar muvaffaqiyatli yangilandi");
        } catch (err) {
            console.error("Xatolik yuz berdi:", err);
        }

        return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'No Action' };
};

async function finishOrder() {
    const phone = document.getElementById('customerPhone').value;
    if (!phone) return alert("Telefon raqamingizni yozing!");

    // Savatchadagi ma'lumotlarni yig'ish (sizning kodingizga moslab)
    const orderData = {
        type: 'new_order',
        orderId: Date.now().toString().slice(-6), // Tasodifiy ID
        items: "Osh (2x), Choy (1x)", // Buni dinamik qiling
        total: "120,000",
        phone: phone
    };

    try {
        const response = await fetch('/.netlify/functions/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        if (response.ok) {
            alert("✅ Buyurtma yuborildi! Tez orada bog'lanamiz.");
        } else {
            alert("❌ Xatolik yuz berdi.");
        }
    } catch (err) {
        console.error(err);
    }
}

exports.handler = async (event) => {
    const body = JSON.parse(event.body || '{}');
    console.log("Aynan kelgan ma'lumot:", body); // SHUNI QO'SHING
    
    // qolgan kodlar...
}