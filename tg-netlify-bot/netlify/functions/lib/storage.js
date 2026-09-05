// Хранение всех данных бота в Netlify Blobs.
// Netlify Blobs — встроенное key-value хранилище Netlify, доступное прямо из функций
// без подключения внешней базы данных. Данные переживают между вызовами функции.

const { getStore } = require("@netlify/blobs");

function store() {
  return getStore("bot-data");
}

const KEYS = {
  staff: "staff",
  management: "management",
  pendingPrefix: "pending:", // pending:<chatId> — состояние диалога (например, ожидание ввода формата)
};

async function readJSON(key, fallback) {
  const store_ = store();
  const raw = await store_.get(key, { type: "json" });
  return raw === null || raw === undefined ? fallback : raw;
}

async function writeJSON(key, value) {
  const store_ = store();
  await store_.setJSON(key, value);
}

// ---------- Персонал ----------

async function getStaffList() {
  return readJSON(KEYS.staff, []);
}

async function saveStaffList(list) {
  return writeJSON(KEYS.staff, list);
}

function normUsername(username) {
  return (username || "").replace(/^@/, "").trim().toLowerCase();
}

async function findStaffByUsername(username) {
  const list = await getStaffList();
  const norm = normUsername(username);
  return list.find((s) => s.username === norm) || null;
}

async function findStaffByTgId(tgId) {
  const list = await getStaffList();
  return list.find((s) => s.tgId === tgId) || null;
}

async function addStaff({ username, robloxNick, hireDate }) {
  const list = await getStaffList();
  const norm = normUsername(username);
  if (list.some((s) => s.username === norm)) {
    return null; // уже существует
  }
  const entry = {
    username: norm,
    tgId: null, // заполнится, когда сотрудник первый раз нажмёт /start
    robloxNick,
    hireDate,
    shifts: 0,
    rank: "Стажёр",
    bucks: 0,
    addedAt: new Date().toISOString(),
  };
  list.push(entry);
  await saveStaffList(list);
  return entry;
}

async function removeStaffByUsername(username) {
  const list = await getStaffList();
  const norm = normUsername(username);
  const idx = list.findIndex((s) => s.username === norm);
  if (idx === -1) return null;
  const [removed] = list.splice(idx, 1);
  await saveStaffList(list);
  return removed;
}

async function updateStaff(username, patch) {
  const list = await getStaffList();
  const norm = normUsername(username);
  const idx = list.findIndex((s) => s.username === norm);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  await saveStaffList(list);
  return list[idx];
}

// ---------- Менеджмент ----------

async function getManagementList() {
  const stored = await readJSON(KEYS.management, []);
  // Плюс "посевной" список из переменной окружения (для первого запуска, чтобы был хоть один админ)
  const seed = (process.env.INITIAL_MANAGEMENT || "")
    .split(",")
    .map((u) => normUsername(u))
    .filter(Boolean);
  const set = new Set([...stored, ...seed]);
  return Array.from(set);
}

async function isManagement(username) {
  const norm = normUsername(username);
  if (!norm) return false;
  const list = await getManagementList();
  return list.includes(norm);
}

// ---------- Состояние диалога (pending actions) ----------

async function getPending(chatId) {
  return readJSON(KEYS.pendingPrefix + chatId, null);
}

async function setPending(chatId, state) {
  return writeJSON(KEYS.pendingPrefix + chatId, state);
}

async function clearPending(chatId) {
  const store_ = store();
  await store_.delete(KEYS.pendingPrefix + chatId);
}

module.exports = {
  normUsername,
  getStaffList,
  saveStaffList,
  findStaffByUsername,
  findStaffByTgId,
  addStaff,
  removeStaffByUsername,
  updateStaff,
  getManagementList,
  isManagement,
  getPending,
  setPending,
  clearPending,
};
