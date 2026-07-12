import * as config from './config.js';
import * as authApi from './auth.js';
import * as api from './api.js';
import * as store from './store.js';
import * as idb from './idb.js';
import { drawCategoryBarChart, drawMonthlyTrendChart } from './charts.js';
import { recognizeReceipt } from './ocr.js';

// ---------- state ----------
let categories = store.getCachedCategories();
let expenses = store.getCachedExpenses();
let selectedReceiptFile = null;
let currentView = 'view-input';
let listMonth = startOfMonth(new Date());
let reportMonth = startOfMonth(new Date());
let isSyncing = false;

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);

const screens = {
  setup: $('setup-screen'),
  login: $('login-screen'),
  loading: $('loading-screen'),
  app: $('app'),
};

const clientIdInput = $('client-id-input');
const setupError = $('setup-error');
const loginError = $('login-error');
const syncBadge = $('sync-badge');

const expenseForm = $('expense-form');
const dateInput = $('f-date');
const categorySelect = $('f-category');
const amountInput = $('f-amount');
const memoInput = $('f-memo');
const receiptInput = $('f-receipt');
const receiptPreview = $('receipt-preview');
const receiptClearBtn = $('receipt-clear');
const ocrStatus = $('ocr-status');
const ocrDebugPreview = $('ocr-debug-preview');
const ocrDebugText = $('ocr-debug-text');
const formMessage = $('form-message');
const recentListEl = $('recent-list');

const listMonthLabel = $('list-month-label');
const listMonthTotal = $('list-month-total');
const monthListEl = $('month-list');

const reportMonthLabel = $('report-month-label');
const reportMonthTotal = $('report-month-total');
const categoryChartCanvas = $('category-chart');
const trendChartCanvas = $('trend-chart');

const settingsSyncStatus = $('settings-sync-status');
const categoryListEl = $('category-list');
const newCategoryInput = $('new-category-input');
const appVersionEl = $('app-version');

// ---------- utilities ----------
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, delta) { return new Date(d.getFullYear(), d.getMonth() + delta, 1); }
function formatMonthLabel(d) { return `${d.getFullYear()}年${d.getMonth() + 1}月`; }
function formatMonthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function formatYen(n) { return `¥${Math.round(n).toLocaleString('ja-JP')}`; }
function todayStr() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
function sortKey(e) { return `${e.date}_${e.createdAt}`; }

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
}

appVersionEl.textContent = `バージョン: ${config.APP_VERSION}`;

// ---------- サービスワーカー登録 ----------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
      registration.update().catch(() => {});
    }).catch((err) => {
      console.error('service worker registration failed', err);
    });
  });
}

// ---------- 認証まわり ----------
async function ensureSignedIn() {
  if (authApi.isSignedIn()) return;
  try {
    await authApi.ensureToken();
  } catch (err) {
    throw new Error('ログインが必要です。設定画面からログインし直してください。');
  }
}

// ---------- サーバー同期 ----------
async function refreshFromServer() {
  const spreadsheetId = await api.ensureSpreadsheet();
  await api.ensureReceiptFolder();
  const [serverExpenses, serverCategories] = await Promise.all([
    api.listExpenses(spreadsheetId),
    api.listCategories(spreadsheetId),
  ]);
  const queue = store.getQueue();
  const queuedExpenses = queue.map((item) => Object.assign({ synced: false }, item.expense));
  expenses = [...queuedExpenses, ...serverExpenses.map((e) => Object.assign({ synced: true }, e))]
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  categories = serverCategories;
  store.setCachedExpenses(expenses);
  store.setCachedCategories(categories);
}

function markExpenseSynced(id, receiptFileId, receiptUrl) {
  const entry = expenses.find((e) => e.id === id);
  if (entry) {
    entry.synced = true;
    if (receiptFileId) entry.receiptFileId = receiptFileId;
    if (receiptUrl) entry.receiptUrl = receiptUrl;
    store.setCachedExpenses(expenses);
  }
}

async function flushQueue() {
  if (isSyncing || !navigator.onLine) return;
  if (!authApi.isSignedIn()) {
    const ok = await authApi.trySilentSignIn();
    if (!ok) return;
  }
  isSyncing = true;
  updateSyncBadge();
  try {
    const spreadsheetId = await api.ensureSpreadsheet();
    const folderId = await api.ensureReceiptFolder();
    const queue = store.getQueue();
    for (const item of queue) {
      try {
        let expenseToSave = item.expense;
        if (item.hasReceipt) {
          const blob = await idb.getBlob(item.localId);
          if (blob) {
            const file = new File([blob], item.receiptName || 'receipt.jpg', { type: blob.type || 'image/jpeg' });
            const uploaded = await api.uploadReceipt(folderId, file);
            expenseToSave = Object.assign({}, item.expense, { receiptFileId: uploaded.id, receiptUrl: uploaded.url });
          }
        }
        await api.appendExpense(spreadsheetId, expenseToSave);
        store.removeQueueItem(item.localId);
        if (item.hasReceipt) await idb.deleteBlob(item.localId);
        markExpenseSynced(item.expense.id, expenseToSave.receiptFileId, expenseToSave.receiptUrl);
      } catch (err) {
        break; // このアイテムで失敗したら以降は次回に持ち越す
      }
    }
  } catch (err) {
    // ensureSpreadsheet/ensureReceiptFolder 自体が失敗した場合は何もせず終了
  } finally {
    isSyncing = false;
    renderAll();
  }
}

// ---------- 描画 ----------
function renderCategorySelect() {
  categorySelect.innerHTML = '';
  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });
}

function expensesInMonth(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  return expenses
    .filter((e) => {
      const d = new Date(`${e.date}T00:00:00`);
      return d.getFullYear() === y && d.getMonth() === m;
    })
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

function renderExpenseItem(e, showDate) {
  const li = document.createElement('li');
  li.className = 'expense-item';

  const main = document.createElement('div');
  main.className = 'exp-main';

  const cat = document.createElement('span');
  cat.className = 'exp-category';
  cat.textContent = e.category;
  main.appendChild(cat);

  const amount = document.createElement('div');
  amount.className = 'exp-amount';
  amount.textContent = formatYen(e.amount);
  main.appendChild(amount);

  if (e.memo) {
    const memo = document.createElement('div');
    memo.className = 'exp-memo';
    memo.textContent = e.memo;
    main.appendChild(memo);
  }
  if (showDate) {
    const date = document.createElement('div');
    date.className = 'exp-date';
    date.textContent = e.date;
    main.appendChild(date);
  }
  if (!e.synced) {
    const pending = document.createElement('div');
    pending.className = 'exp-pending';
    pending.textContent = '未同期';
    main.appendChild(pending);
  }

  const actions = document.createElement('div');
  actions.className = 'exp-actions';
  if (e.receiptUrl) {
    const a = document.createElement('a');
    a.href = e.receiptUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'レシート';
    actions.appendChild(a);
  }
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'delete-btn';
  del.textContent = '削除';
  del.addEventListener('click', () => handleDelete(e));
  actions.appendChild(del);

  li.appendChild(main);
  li.appendChild(actions);
  return li;
}

function renderRecentList() {
  recentListEl.innerHTML = '';
  const items = expenses.slice().sort((a, b) => sortKey(b).localeCompare(sortKey(a))).slice(0, 5);
  items.forEach((e) => recentListEl.appendChild(renderExpenseItem(e, true)));
}

function renderMonthList() {
  listMonthLabel.textContent = formatMonthLabel(listMonth);
  const items = expensesInMonth(listMonth);
  const total = items.reduce((s, e) => s + e.amount, 0);
  listMonthTotal.textContent = formatYen(total);
  monthListEl.innerHTML = '';
  items.forEach((e) => monthListEl.appendChild(renderExpenseItem(e, true)));
}

function renderReport() {
  reportMonthLabel.textContent = formatMonthLabel(reportMonth);
  const items = expensesInMonth(reportMonth);
  const total = items.reduce((s, e) => s + e.amount, 0);
  reportMonthTotal.textContent = formatYen(total);

  const byCategory = {};
  items.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
  const catItems = Object.entries(byCategory)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  drawCategoryBarChart(categoryChartCanvas, catItems);

  const trendItems = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = addMonths(reportMonth, -i);
    const sum = expensesInMonth(d).reduce((s, e) => s + e.amount, 0);
    trendItems.push({ label: `${d.getMonth() + 1}月`, value: sum });
  }
  drawMonthlyTrendChart(trendChartCanvas, trendItems);
}

function renderCategoryList() {
  categoryListEl.innerHTML = '';
  categories.forEach((cat) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = cat;

    const actions = document.createElement('div');
    actions.className = 'category-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'rename-btn';
    renameBtn.textContent = '名前変更';
    renameBtn.addEventListener('click', () => renameCategory(cat));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', () => removeCategory(cat));

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    li.appendChild(span);
    li.appendChild(actions);
    categoryListEl.appendChild(li);
  });
}

function renderSettings() {
  const queue = store.getQueue();
  settingsSyncStatus.textContent = queue.length ? `未同期のデータが ${queue.length} 件あります` : 'すべて同期済みです';
  renderCategoryList();
}

function updateSyncBadge() {
  const n = store.getQueue().length;
  if (n > 0) {
    syncBadge.textContent = isSyncing ? '同期中...' : `未同期 ${n}件`;
    syncBadge.classList.remove('hidden');
  } else {
    syncBadge.classList.add('hidden');
  }
}

function renderAll() {
  renderRecentList();
  if (currentView === 'view-list') renderMonthList();
  if (currentView === 'view-report') renderReport();
  if (currentView === 'view-settings') renderSettings();
  updateSyncBadge();
}

// ---------- フォーム ----------
function resetForm() {
  amountInput.value = '';
  memoInput.value = '';
  clearReceiptSelection();
}

function clearReceiptSelection() {
  selectedReceiptFile = null;
  receiptInput.value = '';
  receiptPreview.classList.add('hidden');
  receiptClearBtn.classList.add('hidden');
  ocrStatus.classList.add('hidden');
  ocrStatus.classList.remove('done');
  ocrDebugPreview.classList.add('hidden');
  ocrDebugText.classList.add('hidden');
}

async function runReceiptOcr(file) {
  ocrStatus.textContent = 'レシートを読み取り中...';
  ocrStatus.classList.remove('hidden', 'done');
  try {
    const result = await recognizeReceipt(file);
    if (result.date) dateInput.value = result.date;
    if (result.amount) amountInput.value = result.amount;
    if (result.place) memoInput.value = result.place;

    if (result.date || result.amount || result.place) {
      ocrStatus.textContent = '読み取りました。内容が正しいか確認してください。';
      ocrStatus.classList.add('done');
    } else {
      ocrStatus.textContent = '読み取れませんでした。手動で入力してください。';
    }

    if (result.debugImage) {
      ocrDebugPreview.src = result.debugImage;
      ocrDebugPreview.classList.remove('hidden');
    }
    const angleLabel = result.skewAngle !== null && result.skewAngle !== undefined ? `${result.skewAngle}°` : '不明';
    ocrDebugText.textContent = `[検出した傾き補正角度] ${angleLabel}\n\n[読み取った生テキスト]\n${result.rawText || '(空)'}`;
    ocrDebugText.classList.remove('hidden');
  } catch (err) {
    ocrStatus.textContent = '読み取りに失敗しました。手動で入力してください。';
    ocrDebugText.textContent = `[エラー]\n${err && err.message ? err.message : err}`;
    ocrDebugText.classList.remove('hidden');
  }
}

receiptInput.addEventListener('change', () => {
  const file = receiptInput.files[0];
  selectedReceiptFile = file || null;
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      receiptPreview.src = reader.result;
      receiptPreview.classList.remove('hidden');
      receiptClearBtn.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    runReceiptOcr(file);
  }
});

receiptClearBtn.addEventListener('click', clearReceiptSelection);

expenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = dateInput.value;
  const category = categorySelect.value;
  const amount = Number(amountInput.value);
  const memo = memoInput.value.trim();
  if (!date || !category || !amount) return;

  const id = api.makeExpenseId();
  const createdAt = new Date().toISOString();
  const baseExpense = { id, date, category, amount, memo, receiptFileId: '', receiptUrl: '', createdAt };
  const file = selectedReceiptFile;

  const cacheEntry = Object.assign({ synced: false }, baseExpense);
  expenses.unshift(cacheEntry);
  store.setCachedExpenses(expenses);
  renderAll();

  formMessage.textContent = '保存中...';
  formMessage.className = 'form-message';

  let succeeded = false;
  if (navigator.onLine) {
    try {
      await ensureSignedIn();
      const spreadsheetId = await api.ensureSpreadsheet();
      let expenseToSave = baseExpense;
      if (file) {
        const folderId = await api.ensureReceiptFolder();
        const uploaded = await api.uploadReceipt(folderId, file);
        expenseToSave = Object.assign({}, baseExpense, { receiptFileId: uploaded.id, receiptUrl: uploaded.url });
      }
      await api.appendExpense(spreadsheetId, expenseToSave);
      cacheEntry.synced = true;
      cacheEntry.receiptFileId = expenseToSave.receiptFileId;
      cacheEntry.receiptUrl = expenseToSave.receiptUrl;
      store.setCachedExpenses(expenses);
      succeeded = true;
    } catch (err) {
      succeeded = false;
    }
  }

  if (!succeeded) {
    const localId = `q_${id}`;
    if (file) await idb.putBlob(localId, file);
    store.pushQueueItem({ localId, expense: baseExpense, hasReceipt: !!file, receiptName: file ? file.name : '' });
  }

  formMessage.textContent = succeeded ? '記録しました' : 'オフラインのため保存しました。オンライン時に自動で同期されます';
  formMessage.className = `form-message ${succeeded ? 'success' : ''}`;
  resetForm();
  renderAll();
});

// ---------- 削除 ----------
async function handleDelete(expense) {
  if (!confirm('この経費を削除しますか？')) return;

  if (!expense.synced) {
    const localId = `q_${expense.id}`;
    const item = store.getQueue().find((q) => q.localId === localId);
    store.removeQueueItem(localId);
    if (item && item.hasReceipt) await idb.deleteBlob(localId);
    expenses = expenses.filter((e) => e.id !== expense.id);
    store.setCachedExpenses(expenses);
    renderAll();
    return;
  }

  if (!navigator.onLine) {
    alert('オフラインのため削除できません。オンライン時にもう一度お試しください。');
    return;
  }
  try {
    await ensureSignedIn();
    const spreadsheetId = await api.ensureSpreadsheet();
    await api.deleteExpense(spreadsheetId, expense.id);
    expenses = expenses.filter((e) => e.id !== expense.id);
    store.setCachedExpenses(expenses);
    renderAll();
  } catch (err) {
    alert(`削除に失敗しました: ${err.message}`);
  }
}

// ---------- 月切り替え ----------
$('list-prev-month').addEventListener('click', () => { listMonth = addMonths(listMonth, -1); renderMonthList(); });
$('list-next-month').addEventListener('click', () => { listMonth = addMonths(listMonth, 1); renderMonthList(); });
$('report-prev-month').addEventListener('click', () => { reportMonth = addMonths(reportMonth, -1); renderReport(); });
$('report-next-month').addEventListener('click', () => { reportMonth = addMonths(reportMonth, 1); renderReport(); });

// ---------- CSVエクスポート ----------
$('export-csv-btn').addEventListener('click', () => {
  const items = expensesInMonth(listMonth);
  const header = ['日付', 'カテゴリ', '金額', 'メモ'];
  const rows = items.map((e) => [e.date, e.category, e.amount, e.memo || '']);
  const csvLines = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const BOM = '﻿';
  const csvBody = csvLines.join('\r\n');
  const blob = new Blob([BOM, csvBody], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `経費_${formatMonthKey(listMonth)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---------- カテゴリ管理 ----------
async function renameCategory(cat) {
  const next = prompt('新しいカテゴリ名を入力してください', cat);
  if (!next || !next.trim() || next.trim() === cat) return;
  const newName = next.trim();
  if (categories.includes(newName)) { alert('既に存在するカテゴリです'); return; }
  if (!navigator.onLine) { alert('オフラインのためカテゴリを変更できません'); return; }
  const nextCategories = categories.map((c) => (c === cat ? newName : c));
  try {
    await ensureSignedIn();
    const spreadsheetId = await api.ensureSpreadsheet();
    await api.saveCategories(spreadsheetId, nextCategories);
    categories = nextCategories;
    store.setCachedCategories(categories);
    renderCategoryList();
    renderCategorySelect();
  } catch (err) {
    alert(`保存に失敗しました: ${err.message}`);
  }
}

async function removeCategory(cat) {
  if (!confirm(`「${cat}」を削除しますか？`)) return;
  if (!navigator.onLine) { alert('オフラインのためカテゴリを変更できません'); return; }
  const next = categories.filter((c) => c !== cat);
  try {
    await ensureSignedIn();
    const spreadsheetId = await api.ensureSpreadsheet();
    await api.saveCategories(spreadsheetId, next);
    categories = next;
    store.setCachedCategories(categories);
    renderCategoryList();
    renderCategorySelect();
  } catch (err) {
    alert(`保存に失敗しました: ${err.message}`);
  }
}

$('add-category-btn').addEventListener('click', async () => {
  const val = newCategoryInput.value.trim();
  if (!val) return;
  if (categories.includes(val)) { alert('既に存在するカテゴリです'); return; }
  if (!navigator.onLine) { alert('オフラインのためカテゴリを追加できません'); return; }
  const next = [...categories, val];
  try {
    await ensureSignedIn();
    const spreadsheetId = await api.ensureSpreadsheet();
    await api.saveCategories(spreadsheetId, next);
    categories = next;
    store.setCachedCategories(categories);
    newCategoryInput.value = '';
    renderCategoryList();
    renderCategorySelect();
  } catch (err) {
    alert(`保存に失敗しました: ${err.message}`);
  }
});

// ---------- 設定: その他 ----------
$('sync-now-btn').addEventListener('click', async () => {
  settingsSyncStatus.textContent = '同期中...';
  try {
    if (!authApi.isSignedIn()) {
      const ok = await authApi.trySilentSignIn();
      if (!ok) await authApi.signIn();
    }
    await flushQueue();
    await refreshFromServer();
    renderCategorySelect();
    renderAll();
  } catch (err) {
    alert(`同期に失敗しました: ${err.message}`);
  }
  renderSettings();
});

$('open-sheet-btn').addEventListener('click', () => {
  const id = config.getSpreadsheetId();
  if (id) window.open(`https://docs.google.com/spreadsheets/d/${id}/edit`, '_blank', 'noopener');
  else alert('スプレッドシートがまだ作成されていません');
});

$('clear-cache-btn').addEventListener('click', async () => {
  if (!confirm('ローカルの表示キャッシュを消去してサーバーから読み込み直しますか？（未同期データは保持されます）')) return;
  showScreen('loading');
  try {
    await refreshFromServer();
  } catch (err) {
    alert(`読み込みに失敗しました: ${err.message}`);
  }
  renderCategorySelect();
  renderAll();
  showScreen('app');
});

$('signout-btn').addEventListener('click', () => {
  authApi.signOut();
  showScreen('login');
});

// ---------- ナビゲーション ----------
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const viewId = btn.dataset.view;
    currentView = viewId;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== viewId));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderAll();
  });
});

// ---------- ログイン/セットアップ ----------
$('save-client-id').addEventListener('click', async () => {
  const val = clientIdInput.value.trim();
  if (!val) { setupError.textContent = 'クライアントIDを入力してください'; return; }
  config.setClientId(val);
  setupError.textContent = '';
  try {
    await authApi.initAuth(val);
  } catch (err) {
    setupError.textContent = err.message;
    return;
  }
  showScreen('loading');
  const signed = await authApi.trySilentSignIn();
  if (signed) await afterSignIn();
  else showScreen('login');
});

$('open-setup-btn').addEventListener('click', () => {
  clientIdInput.value = config.getClientId();
  showScreen('setup');
});

$('signin-btn').addEventListener('click', async () => {
  loginError.textContent = '';
  try {
    await authApi.signIn();
    await afterSignIn();
  } catch (err) {
    loginError.textContent = `ログインに失敗しました: ${err.message}`;
  }
});

// ---------- 起動シーケンス ----------
async function afterSignIn() {
  showScreen('loading');
  try {
    await refreshFromServer();
  } catch (err) {
    // オフライン等でも、ローカルキャッシュのまま続行する
  }
  renderCategorySelect();
  if (!dateInput.value) dateInput.value = todayStr();
  renderAll();
  showScreen('app');
  flushQueue();
}

async function init() {
  registerServiceWorker();
  renderCategorySelect();
  dateInput.value = todayStr();
  renderAll();

  window.addEventListener('online', () => flushQueue());

  const clientId = config.getClientId();
  if (!clientId) { showScreen('setup'); return; }

  try {
    await authApi.initAuth(clientId);
  } catch (err) {
    setupError.textContent = err.message;
    showScreen('setup');
    return;
  }

  showScreen('loading');
  const signed = await authApi.trySilentSignIn();
  if (signed) await afterSignIn();
  else showScreen('login');
}

init();
