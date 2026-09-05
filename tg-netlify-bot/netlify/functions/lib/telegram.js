// Простая обёртка над Telegram Bot API через fetch (Node 18+, в Netlify Functions уже есть глобальный fetch)

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function callTelegram(method, payload) {
  const res = await fetch(`${API_URL}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error [${method}]:`, data);
  }
  return data;
}

function sendMessage(chatId, text, extra = {}) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

function answerCallbackQuery(callbackQueryId, text) {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

function editMessageText(chatId, messageId, text, extra = {}) {
  return callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

// Утилита для быстрой сборки inline-клавиатуры из массива кнопок [{text, callback_data}]
function inlineKeyboard(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

module.exports = {
  sendMessage,
  answerCallbackQuery,
  editMessageText,
  inlineKeyboard,
};
