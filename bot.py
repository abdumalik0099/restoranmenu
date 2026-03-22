import firebase_admin
from firebase_admin import credentials, firestore
from telegram import Update
from telegram.ext import Application, CallbackQueryHandler, ContextTypes

# Firebase
cred = credentials.Certificate("serviceAccount.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    print(f"Callback data: {data}")

    first = data.index("_")
    action = data[:first]
    order_id = data[first + 1:]
    print(f"Action: {action}, OrderId: {order_id}")

    status = "accepted" if action == "accept" else "rejected"

    try:
        db.collection("orders").document(order_id).update({"status": status})
        print(f"✅ Firestore updated: {order_id} -> {status}")
    except Exception as e:
        print(f"❌ Firestore error: {e}")

    await query.edit_message_reply_markup(reply_markup=None)
    text = "✅ ЗАКАЗ ҚАБУЛ ҚИЛИНДИ!" if status == "accepted" else "❌ ЗАКАЗ РАД ЭТИЛДИ."
    await query.message.reply_text(text)

BOT_TOKEN = "8747650320:AAFrKHSF3wJvsGrRJIagLJ7i_WhMGLExXLQ"
app = Application.builder().token(BOT_TOKEN).build()
app.add_handler(CallbackQueryHandler(handle_button))
print("✅ Bot ishlamoqda...")
app.run_polling()