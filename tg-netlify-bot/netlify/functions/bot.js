const { handleMessage, handleCallbackQuery } = require("./lib/handlers");

// Netlify Function (формат "Lambda compatible" handler).
// Telegram будет слать сюда апдейты через webhook: POST /.netlify/functions/bot
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "OK" };
  }

  // Необязательная, но рекомендуемая защита: секретный токен вебхука.
  // Если задан SECRET_TOKEN, Telegram будет присылать его в заголовке
  // X-Telegram-Bot-Api-Secret-Token (см. параметр secret_token в setWebhook).
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (expectedSecret) {
    const gotSecret = event.headers["x-telegram-bot-api-secret-token"];
    if (gotSecret !== expectedSecret) {
      return { statusCode: 401, body: "Unauthorized" };
    }
  }

  let update;
  try {
    update = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Bad Request" };
  }

  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (err) {
    // Логируем, но всегда отвечаем Телеграму 200,
    // иначе он будет повторно слать один и тот же апдейт снова и снова.
    console.error("Ошибка обработки апдейта:", err);
  }

  return { statusCode: 200, body: "OK" };
};
