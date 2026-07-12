// オフライン時のローカルキャッシュと未同期キューを管理するモジュール
const KEYS = {
  expenses: 'keihi.cache.expenses',
  categories: 'keihi.cache.categories',
  queue: 'keihi.pendingQueue',
  receiptBlobs: 'keihi.pendingReceipts', // IndexedDB は使わずシンプルに保持数を絞る前提
  knownStores: 'keihi.knownStores',
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getCachedExpenses() {
  return readJson(KEYS.expenses, []);
}

export function setCachedExpenses(list) {
  writeJson(KEYS.expenses, list);
}

export function getCachedCategories() {
  return readJson(KEYS.categories, []);
}

export function setCachedCategories(list) {
  writeJson(KEYS.categories, list);
}

// ---- よく使う店舗(OCRのマッチング精度を上げるための端末内リスト。Googleシートには保存しない) ----

export function getKnownStores() {
  return readJson(KEYS.knownStores, []);
}

export function setKnownStores(list) {
  writeJson(KEYS.knownStores, list);
}

// ---- 未同期キュー（オフライン時に登録した経費を一時保存） ----
// item: { type: 'add', expense: {...}, receiptDataUrl?: string, receiptName?: string }

export function getQueue() {
  return readJson(KEYS.queue, []);
}

export function setQueue(queue) {
  writeJson(KEYS.queue, queue);
}

export function pushQueueItem(item) {
  const queue = getQueue();
  queue.push(item);
  setQueue(queue);
}

export function removeQueueItem(localId) {
  const queue = getQueue().filter((item) => item.localId !== localId);
  setQueue(queue);
}
