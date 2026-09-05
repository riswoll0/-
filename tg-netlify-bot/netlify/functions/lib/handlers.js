const tg = require("./telegram");
const db = require("./storage");

// ---------- Клавиатуры ----------

function staffMenuKeyboard() {
  return tg.inlineKeyboard([
    [{ text: "👤 Личный профиль", callback_data: "staff:profile" }],
  ]);
}

function managementMenuKeyboard() {
  return tg.inlineKeyboard([
    [{ text: "📋 Список персонала", callback_data: "mgmt:list" }],
    [{ text: "➕ Добавить нового персонала", callback_data: "mgmt:add" }],
    [{ text: "💰 Выдать баксы", callback_data: "mgmt:give_bucks" }],
  ]);
}

function backToMenuKeyboard(target) {
  return tg.inlineKeyboard([[{ text: "⬅️ Назад в меню", callback_data: `menu:${target}` }]]);
}

// ---------- Общие тексты ----------

function welcomeText(displayName) {
  return `Добро пожаловать! ${displayName}\nВыберите нужную вам категорию.`;
}

function displayNameFromUser(from) {
  return from.username ? `@${from.username}` : from.first_name || "Гость";
}

// ---------- /start ----------

async function handleStart(chatId, from) {
  const username = from.username;
  const displayName = displayNameFromUser(from);

  if (username && (await db.isManagement(username))) {
    await tg.sendMessage(chatId, welcomeText(displayName), managementMenuKeyboard());
    return;
  }

  if (username) {
    const staff = await db.findStaffByUsername(username);
    if (staff) {
      // Обновляем tg_id на случай если это первый вход
      if (staff.tgId !== chatId) {
        await db.updateStaff(username, { tgId: chatId });
      }
      await tg.sendMessage(chatId, welcomeText(displayName), staffMenuKeyboard());
      return;
    }
  }

  await tg.sendMessage(
    chatId,
    "🚫 У вас нет доступа к личному кабинету.\nОбратитесь к менеджменту, чтобы вас добавили в список персонала."
  );
}

// ---------- /delete ----------

async function handleDelete(chatId, from, rawArgsText) {
  const username = from.username;
  if (!username || !(await db.isManagement(username))) {
    await tg.sendMessage(chatId, "🚫 Эта команда доступна только менеджменту.");
    return;
  }

  // Формат: /delete НикТг Причина увольнения
  const parts = rawArgsText.trim().split(/\s+/);
  if (parts.length < 2) {
    await tg.sendMessage(
      chatId,
      "Формат команды:\n<code>/delete НикТг Причина увольнения</code>"
    );
    return;
  }

  const targetUsername = parts.shift();
  const reason = parts.join(" ");

  const removed = await db.removeStaffByUsername(targetUsername);
  if (!removed) {
    await tg.sendMessage(chatId, `Сотрудник @${db.normUsername(targetUsername)} не найден в списке.`);
    return;
  }

  await tg.sendMessage(
    chatId,
    `✅ Сотрудник @${removed.username} удалён из персонала.\nПричина: ${reason}`
  );

  if (removed.tgId) {
    await tg.sendMessage(
      removed.tgId,
      `❌ Вы были уволены.\nПричина: ${reason}\n\nДоступ к личному кабинету закрыт.`
    );
  }
}

// ---------- Личный профиль (для персонала) ----------

async function showStaffProfile(chatId, from) {
  const staff = await db.findStaffByUsername(from.username);
  if (!staff) {
    await tg.sendMessage(chatId, "🚫 Доступ не найден.");
    return;
  }
  const text =
    `👤 <b>Личный профиль</b>\n\n` +
    `Ник (Telegram): @${staff.username}\n` +
    `ID: <code>${staff.tgId}</code>\n` +
    `Смен посещено: ${staff.shifts}\n` +
    `Ранг: ${staff.rank}\n` +
    `Баксы: ${staff.bucks}`;
  await tg.sendMessage(chatId, text, backToMenuKeyboard("staff"));
}

// ---------- Список персонала (менеджмент) ----------

async function showStaffListForManagement(chatId) {
  const list = await db.getStaffList();
  if (list.length === 0) {
    await tg.sendMessage(chatId, "Список персонала пуст.", backToMenuKeyboard("mgmt"));
    return;
  }
  const lines = list.map(
    (s, i) =>
      `${i + 1}. @${s.username} — ранг: ${s.rank}, смен: ${s.shifts}, баксы: ${s.bucks}` +
      (s.robloxNick ? `, Roblox: ${s.robloxNick}` : "")
  );
  await tg.sendMessage(
    chatId,
    `📋 <b>Список персонала (${list.length})</b>\n\n${lines.join("\n")}`,
    backToMenuKeyboard("mgmt")
  );
}

// ---------- Добавление персонала (диалог из двух шагов) ----------

async function startAddStaffFlow(chatId) {
  await db.setPending(chatId, { action: "awaiting_add_staff" });
  await tg.sendMessage(
    chatId,
    "Введите данные нового сотрудника в формате:\n\n" +
      "<code>НикТГ/НикRoblox/Дата устройства</code>\n\n" +
      "Например: <code>ivanov/Ivanov_Roblox/05.09.2026</code>"
  );
}

async function handleAddStaffInput(chatId, text) {
  const parts = text.split("/").map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !p)) {
    await tg.sendMessage(
      chatId,
      "Неверный формат. Нужно ровно 3 части через «/»:\n<code>НикТГ/НикRoblox/Дата устройства</code>\nПопробуйте ещё раз или отправьте /cancel."
    );
    return; // остаёмся в том же pending-состоянии
  }
  const [tgNick, robloxNick, hireDate] = parts;
  const entry = await db.addStaff({ username: tgNick, robloxNick, hireDate });
  await db.clearPending(chatId);

  if (!entry) {
    await tg.sendMessage(
      chatId,
      `Сотрудник @${db.normUsername(tgNick)} уже есть в списке.`,
      backToMenuKeyboard("mgmt")
    );
    return;
  }

  await tg.sendMessage(
    chatId,
    `✅ Сотрудник добавлен:\nТГ: @${entry.username}\nRoblox: ${entry.robloxNick}\nУстроился: ${entry.hireDate}\n\nТеперь при вводе /start у него откроется личный кабинет.`,
    backToMenuKeyboard("mgmt")
  );
}

// ---------- Выдача баксов (диалог из двух шагов) ----------

async function startGiveBucksFlow(chatId) {
  await db.setPending(chatId, { action: "awaiting_bucks_username" });
  await tg.sendMessage(chatId, "Введите Ник ТГ сотрудника, которому нужно выдать баксы:");
}

async function handleGiveBucksUsername(chatId, text) {
  const username = text.trim();
  const staff = await db.findStaffByUsername(username);
  if (!staff) {
    await tg.sendMessage(
      chatId,
      `Сотрудник @${db.normUsername(username)} не найден. Попробуйте ещё раз или отправьте /cancel.`
    );
    return;
  }
  await db.setPending(chatId, {
    action: "awaiting_bucks_amount",
    targetUsername: staff.username,
  });
  await tg.sendMessage(chatId, `Сколько баксов выдать сотруднику @${staff.username}? (введите число)`);
}

async function handleGiveBucksAmount(chatId, text, pending) {
  const amount = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(amount)) {
    await tg.sendMessage(chatId, "Нужно ввести число. Попробуйте ещё раз или отправьте /cancel.");
    return;
  }
  const staff = await db.findStaffByUsername(pending.targetUsername);
  if (!staff) {
    await db.clearPending(chatId);
    await tg.sendMessage(chatId, "Сотрудник больше не найден в списке.", backToMenuKeyboard("mgmt"));
    return;
  }
  const updated = await db.updateStaff(staff.username, { bucks: (staff.bucks || 0) + amount });
  await db.clearPending(chatId);

  await tg.sendMessage(
    chatId,
    `✅ Сотруднику @${updated.username} начислено ${amount} баксов.\nТекущий баланс: ${updated.bucks}`,
    backToMenuKeyboard("mgmt")
  );

  if (updated.tgId) {
    await tg.sendMessage(updated.tgId, `💰 Вам начислено ${amount} баксов.\nТекущий баланс: ${updated.bucks}`);
  }
}

// ---------- Роутинг callback-кнопок ----------

async function handleCallbackQuery(cb) {
  const chatId = cb.message.chat.id;
  const data = cb.data;
  const from = cb.from;

  await tg.answerCallbackQuery(cb.id);

  if (data === "menu:staff") {
    await tg.sendMessage(chatId, welcomeText(displayNameFromUser(from)), staffMenuKeyboard());
    return;
  }
  if (data === "menu:mgmt") {
    await tg.sendMessage(chatId, welcomeText(displayNameFromUser(from)), managementMenuKeyboard());
    return;
  }

  if (data === "staff:profile") {
    await showStaffProfile(chatId, from);
    return;
  }

  // Проверка прав менеджмента для всех mgmt:* действий
  if (data.startsWith("mgmt:")) {
    if (!from.username || !(await db.isManagement(from.username))) {
      await tg.sendMessage(chatId, "🚫 Недостаточно прав.");
      return;
    }
    if (data === "mgmt:list") {
      await showStaffListForManagement(chatId);
    } else if (data === "mgmt:add") {
      await startAddStaffFlow(chatId);
    } else if (data === "mgmt:give_bucks") {
      await startGiveBucksFlow(chatId);
    }
  }
}

// ---------- Роутинг обычных текстовых сообщений ----------

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  const text = (msg.text || "").trim();

  if (text === "/start") {
    await handleStart(chatId, from);
    return;
  }

  if (text === "/cancel") {
    await db.clearPending(chatId);
    await tg.sendMessage(chatId, "Действие отменено.");
    return;
  }

  if (text.startsWith("/delete")) {
    await handleDelete(chatId, from, text.slice("/delete".length));
    return;
  }

  // Если у пользователя есть незавершённый диалог (добавление сотрудника / выдача баксов)
  const pending = await db.getPending(chatId);
  if (pending) {
    if (!from.username || !(await db.isManagement(from.username))) {
      // На всякий случай: если права отозвали посреди диалога
      await db.clearPending(chatId);
      return;
    }
    if (pending.action === "awaiting_add_staff") {
      await handleAddStaffInput(chatId, text);
      return;
    }
    if (pending.action === "awaiting_bucks_username") {
      await handleGiveBucksUsername(chatId, text);
      return;
    }
    if (pending.action === "awaiting_bucks_amount") {
      await handleGiveBucksAmount(chatId, text, pending);
      return;
    }
  }

  // Ничего не подошло
  await tg.sendMessage(chatId, "Не понимаю эту команду. Отправьте /start.");
}

module.exports = {
  handleMessage,
  handleCallbackQuery,
};
