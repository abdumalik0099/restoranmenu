import firebase_admin
from firebase_admin import credentials, firestore
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CallbackQueryHandler, ContextTypes

cred = credentials.Certificate("serviceAccount.json")
firebase_admin.initialize_app(cred)
db = firestore.client()


def get_reject_keyboard(order_id):
    keyboard = [
        [InlineKeyboardButton("?? Taom tugagan", callback_data=f"re_1_{order_id}")],
        [InlineKeyboardButton("?? Restoran yopilgan", callback_data=f"re_2_{order_id}")],
        [InlineKeyboardButton("? Juda ko'p zakaz bor", callback_data=f"re_3_{order_id}")],
        [InlineKeyboardButton("?? Manzil uzoq", callback_data=f"re_4_{order_id}")],
        [InlineKeyboardButton("?? Boshqa sabab", callback_data=f"re_5_{order_id}")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_main_keyboard(phone, order_id, include_paid=False):
    keyboard = [
        [InlineKeyboardButton("? Qabul", callback_data=f"accept_{phone}_{order_id}")],
        [InlineKeyboardButton("?? Tayyorlanmoqda", callback_data=f"cook_{phone}_{order_id}")],
        [InlineKeyboardButton("? Rad etish", callback_data=f"reject_{phone}_{order_id}")],
    ]
    if include_paid:
        keyboard.append([InlineKeyboardButton("?? To'landi", callback_data=f"paid_{phone}_{order_id}")])
    return InlineKeyboardMarkup(keyboard)


def parse_callback(data: str):
    first = data.index("_")
    action = data[:first]
    rest = data[first + 1 :]
    order_start = rest.index("order_")
    order_id = rest[order_start:]
    phone = rest[: order_start - 1]
    return action, phone, order_id


async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("re_"):
        parts = data.split("_")
        reason_id = parts[1]
        order_id = "_".join(parts[2:])
        reasons = {
            "1": "?? Taom tugagan",
            "2": "?? Restoran yopilgan",
            "3": "? Juda ko'p zakaz bor",
            "4": "?? Manzil uzoq",
            "5": "?? Boshqa sabab",
        }
        reason = reasons.get(reason_id, "Noma'lum sabab")

        try:
            db.collection("orders").document(order_id).update({
                "status": "rejected",
                "rejectReason": reason,
            })
            final_text = f"{query.message.text}\n\n? Rad etildi.\nSabab: {reason}"
            await query.edit_message_text(text=final_text, reply_markup=None)
            print(f"Rejected {order_id}: {reason}")
        except Exception as e:
            print(f"Reject error: {e}")
        return

    try:
        action, phone, order_id = parse_callback(data)
    except Exception as e:
        print(f"Parse error: {e}")
        return

    if action == "accept":
        try:
            db.collection("orders").document(order_id).update({"status": "accepted"})
            new_text = f"{query.message.text}\n\n? Zakaz qabul qilindi."
            await query.edit_message_text(
                text=new_text,
                reply_markup=get_main_keyboard(phone, order_id, include_paid=True),
            )
            print(f"Accepted {order_id}")
        except Exception as e:
            print(f"Accept error: {e}")

    elif action == "cook":
        try:
            db.collection("orders").document(order_id).update({
                "status": "cooking",
                "cookingStartedAt": firestore.SERVER_TIMESTAMP,
            })
            new_text = f"{query.message.text}\n\n?? Zakaz tayyorlanmoqda."
            await query.edit_message_text(
                text=new_text,
                reply_markup=get_main_keyboard(phone, order_id, include_paid=False),
            )
            print(f"Cooking {order_id}")
        except Exception as e:
            print(f"Cook error: {e}")

    elif action == "paid":
        try:
            db.collection("orders").document(order_id).update({
                "paid": True,
                "paidAt": firestore.SERVER_TIMESTAMP,
            })
            new_text = f"{query.message.text}\n\n?? To'landi."
            await query.edit_message_text(text=new_text, reply_markup=None)
            print(f"Paid {order_id}")
        except Exception as e:
            print(f"Paid error: {e}")

    elif action == "reject":
        reply_markup = get_reject_keyboard(order_id)
        warning_text = f"{query.message.text}\n\n?? Rad etish sababini tanlang:"
        await query.edit_message_text(text=warning_text, reply_markup=reply_markup)


BOT_TOKEN = "8747650320:AAFrKHSF3wJvsGrRJIagLJ7i_WhMGLExXLQ"


def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CallbackQueryHandler(handle_button))
    print("Bot ishga tushdi")
    app.run_polling()


if __name__ == "__main__":
    main()
