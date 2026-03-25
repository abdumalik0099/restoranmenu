import firebase_admin
from firebase_admin import credentials, firestore
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CallbackQueryHandler, ContextTypes, MessageHandler, filters

# ═══ FIREBASE SOZLAMALARI ═══
cred = credentials.Certificate("serviceAccount.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# ═══ YORDAMCHI FUNKSIYALAR ═══

def get_reject_keyboard(order_id):
    """Rad etish sabablari uchun tugmalar menyusi"""
    keyboard = [
        [InlineKeyboardButton("🍽 Таом тугаган", callback_data=f"re_1_{order_id}")],
        [InlineKeyboardButton("🚪 Ресторан ёпилган", callback_data=f"re_2_{order_id}")],
        [InlineKeyboardButton("⏳ Жуда кўп заказ бор", callback_data=f"re_3_{order_id}")],
        [InlineKeyboardButton("📍 Манзил узоқ", callback_data=f"re_4_{order_id}")],
        [InlineKeyboardButton("✏️ Бошқа сабаб", callback_data=f"re_5_{order_id}")]
    ]
    return InlineKeyboardMarkup(keyboard)

def parse_callback(data: str):
    """Callback ma'lumotlarini qismlarga ajratish"""
    first = data.index("_")
    action = data[:first]
    rest = data[first + 1:]
    
    order_start = rest.index("order_")
    order_id = rest[order_start:]
    phone = rest[:order_start - 1]
    return action, phone, order_id

# ═══ ASOSIY HANDLER ═══

async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    # 1. RAD ETISH SABABI TANLANGANDA (re_ bilan boshlansa)
    if data.startswith("re_"):
        parts = data.split("_")
        reason_id = parts[1]
        oid = "_".join(parts[2:]) # order_id qismini yig'ish
        
        reasons = {
            "1": "🍽 Таом тугаган",
            "2": "🚪 Ресторан ёпилган",
            "3": "⏳ Жуда кўп заказ бор",
            "4": "📍 Манзил узоқ",
            "5": "✏️ Бошқа сабаб"
        }
        sabab = reasons.get(reason_id, "Номаълум сабаб")

        try:
            # Firebase-da statusni yangilash
            db.collection("orders").document(oid).update({
                "status": "rejected",
                "rejectReason": sabab
            })
            # Xabarni tahrirlash (tugmalarni o'chirib, sababni yozish)
            final_text = f"{query.message.text}\n\n❌ РАД ЭТИЛДИ.\nСабаб: {sabab}"
            await query.edit_message_text(text=final_text, reply_markup=None)
            print(f"✅ Order {oid} rejected: {sabab}")
        except Exception as e:
            print(f"❌ Firestore update error: {e}")
        return

    # 2. ASOSIY QABUL/RAD TUGMALARI (accept/reject)
    try:
        action, phone, order_id = parse_callback(data)
    except Exception as e:
        print(f"❌ Parse error: {e}")
        return

    if action == "accept":
        try:
            db.collection("orders").document(order_id).update({"status": "accepted"})
            new_text = f"{query.message.text}\n\n✅ ЗАКАЗ ҚАБУЛ ҚИЛИНДИ!"
            await query.edit_message_text(text=new_text, reply_markup=None)
            print(f"✅ Order {order_id} accepted")
        except Exception as e:
            print(f"❌ Accept error: {e}")

    elif action == "reject":
        # Rasmdagidek rad etish menyusini chiqarish
        reply_markup = get_reject_keyboard(order_id)
        warning_text = f"{query.message.text}\n\n⚠️ Рад этиш сабабини танланг:"
        await query.edit_message_text(text=warning_text, reply_markup=reply_markup)

# ═══ BOTNI ISHGA TUSHIRISH ═══

BOT_TOKEN = "8747650320:AAFrKHSF3wJvsGrRJIagLJ7i_WhMGLExXLQ"

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    
    # Callbacklarni ushlash
    app.add_handler(CallbackQueryHandler(handle_button))
    
    print("✅ Bot muvaffaqiyatli ishga tushdi...")
    app.run_polling()

if __name__ == "__main__":
    main()