// Скрипт для установки вебхука Telegram на ваш сайт Netlify.
// Запуск: node set-webhook.js https://ваш-сайт.netlify.app СЕКРЕТ
//   первый аргумент — URL вашего сайта на Netlify (без слэша в конце)
//   второй аргумент — необязательный секрет (должен совпадать с WEBHOOK_SECRET в Netlify)
//
// Токен бота берётся из переменной окружения BOT_TOKEN (или впишите его прямо в команду:
// BOT_TOKEN=123:ABC node set-webhook.js https://site.netlify.app mysecret )

const BOT_TOKEN = process.env.BOT_TOKEN;
const siteUrl = process.argv[2];
const secret = process.argv[3];

if (!BOT_TOKEN) {
  console.error("Ошибка: не задана переменная окружения BOT_TOKEN");
  process.exit(1);
}
if (!siteUrl) {
  console.error("Использование: node set-webhook.js https://ваш-сайт.netlify.app [секрет]");
  process.exit(1);
}

const webhookUrl = `${siteUrl.replace(/\/$/, "")}/.netlify/functions/bot`;

(async () => {
  const body = { url: webhookUrl };
  if (secret) body.secret_token = secret;

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log("Ответ Telegram:", data);

  const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`).then((r) => r.json());
  console.log("Текущая информация о вебхуке:", info);
})();
