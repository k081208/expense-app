// Google Sheets API / Drive API とのやり取りをまとめるモジュール
import { getAccessToken } from './auth.js';
import {
  SPREADSHEET_NAME,
  RECEIPT_FOLDER_NAME,
  APP_TAG,
  DEFAULT_CATEGORIES,
  getSpreadsheetId,
  setSpreadsheetId,
  getFolderId,
  setFolderId,
} from './config.js';

export class AuthError extends Error {}

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

const EXPENSES_SHEET = 'Expenses';
const CATEGORIES_SHEET = 'Categories';
const SUMMARY_SHEET = '月次集計';
const DAILY_SUMMARY_SHEET = '日次集計';
const EXPENSES_HEADER = ['ID', 'Date', 'Category', 'Amount', 'Memo', 'ReceiptFileId', 'ReceiptURL', 'CreatedAt'];

async function authedFetch(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw new AuthError('未ログインです');
  const headers = Object.assign({}, options.headers, { Authorization: `Bearer ${token}` });
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (res.status === 401) throw new AuthError('認証の有効期限が切れました');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API エラー (${res.status}): ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- Drive: スプレッドシート/フォルダの検索・作成 ----------

async function findAppFile(name, mimeType) {
  const q = encodeURIComponent(
    `name = '${name}' and mimeType = '${mimeType}' and appProperties has { key='appTag' and value='${APP_TAG}' } and trashed = false`
  );
  const data = await authedFetch(`${DRIVE_BASE}?q=${q}&fields=files(id,name)&spaces=drive`);
  return data.files && data.files.length ? data.files[0].id : null;
}

async function tagFile(fileId) {
  await authedFetch(`${DRIVE_BASE}/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appProperties: { appTag: APP_TAG } }),
  });
}

export async function ensureSpreadsheet() {
  let id = getSpreadsheetId();
  if (id) {
    try {
      await authedFetch(`${SHEETS_BASE}/${id}?fields=spreadsheetId`);
      return id;
    } catch (err) {
      if (!(err instanceof AuthError)) setSpreadsheetId('');
      else throw err;
    }
  }

  id = await findAppFile(SPREADSHEET_NAME, 'application/vnd.google-apps.spreadsheet');
  if (!id) {
    const created = await authedFetch(SHEETS_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: SPREADSHEET_NAME },
        sheets: [{ properties: { title: EXPENSES_SHEET } }, { properties: { title: CATEGORIES_SHEET } }],
      }),
    });
    id = created.spreadsheetId;
    await tagFile(id);
    await authedFetch(`${SHEETS_BASE}/${id}/values/${EXPENSES_SHEET}!A1:H1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [EXPENSES_HEADER] }),
    });
    await authedFetch(`${SHEETS_BASE}/${id}/values/${CATEGORIES_SHEET}!A1:A${DEFAULT_CATEGORIES.length + 1}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [['Category'], ...DEFAULT_CATEGORIES.map((c) => [c])] }),
    });
  }
  setSpreadsheetId(id);
  return id;
}

export async function ensureReceiptFolder() {
  let id = getFolderId();
  if (id) {
    try {
      await authedFetch(`${DRIVE_BASE}/${id}?fields=id,trashed`);
      return id;
    } catch (err) {
      if (!(err instanceof AuthError)) setFolderId('');
      else throw err;
    }
  }
  id = await findAppFile(RECEIPT_FOLDER_NAME, 'application/vnd.google-apps.folder');
  if (!id) {
    const created = await authedFetch(DRIVE_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: RECEIPT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: { appTag: APP_TAG },
      }),
    });
    id = created.id;
  }
  setFolderId(id);
  return id;
}

// ---------- 経費データ ----------

export function makeExpenseId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export async function appendExpense(spreadsheetId, expense) {
  const row = [
    expense.id,
    expense.date,
    expense.category,
    expense.amount,
    expense.memo || '',
    expense.receiptFileId || '',
    expense.receiptUrl || '',
    expense.createdAt,
  ];
  await authedFetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${EXPENSES_SHEET}!A1:H1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    }
  );
}

export async function listExpenses(spreadsheetId) {
  const data = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values/${EXPENSES_SHEET}!A2:H`);
  const rows = data.values || [];
  return rows
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0],
      date: r[1] || '',
      category: r[2] || '',
      amount: Number(r[3]) || 0,
      memo: r[4] || '',
      receiptFileId: r[5] || '',
      receiptUrl: r[6] || '',
      createdAt: r[7] || '',
    }));
}

export async function deleteExpense(spreadsheetId, expenseId) {
  const data = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values/${EXPENSES_SHEET}!A2:A`);
  const rows = data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === expenseId);
  if (rowIndex === -1) return false;
  const sheetMeta = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties`);
  const sheet = sheetMeta.sheets.find((s) => s.properties.title === EXPENSES_SHEET);
  const sheetId = sheet.properties.sheetId;
  const rowNumber = rowIndex + 1; // A2 が index0 => 実シート上は2行目(0-indexed:1)
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowNumber, endIndex: rowNumber + 1 },
          },
        },
      ],
    }),
  });
  return true;
}

// ---------- カテゴリ ----------

export async function listCategories(spreadsheetId) {
  const data = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values/${CATEGORIES_SHEET}!A2:A`);
  const rows = data.values || [];
  const list = rows.map((r) => r[0]).filter(Boolean);
  return list.length ? list : DEFAULT_CATEGORIES.slice();
}

export async function saveCategories(spreadsheetId, categories) {
  // 新しいリストより前回の件数が多い場合でも残らないよう、十分大きな範囲をクリアしてから書き込む
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values/${CATEGORIES_SHEET}!A2:A1000:clear`, {
    method: 'POST',
  });
  if (!categories.length) return;
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values/${CATEGORIES_SHEET}!A2:A${categories.length + 1}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: categories.map((c) => [c]) }),
  });
}

// ---------- 月次集計(PCでの確認用にGoogleスプレッドシート内へ書き出す) ----------

async function ensureSheetExists(spreadsheetId, sheetName) {
  const meta = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties`);
  const exists = meta.sheets.some((s) => s.properties.title === sheetName);
  if (exists) return;
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    }),
  });
}

function columnLetter(index) {
  // index: 0始まり。カテゴリ数が26列を超えることは想定しないため単純なA〜Zのみ対応
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

// (グループキー)×カテゴリの合計金額表を計算し、指定したシートに書き出す共通処理。
// 月次集計・日次集計の両方で使う。PCでいつでも確認できるよう、スプレッドシート上に
// 実際の値として保存する(アプリ側でデータを同期するたびに更新される)
async function writeGroupedSummary(spreadsheetId, sheetName, groupLabel, expenses, categories, groupKeyOf) {
  await ensureSheetExists(spreadsheetId, sheetName);

  const totals = {};
  const groupKeys = new Set();
  expenses.forEach((e) => {
    const key = groupKeyOf(e.date);
    if (!key) return;
    groupKeys.add(key);
    if (!totals[key]) totals[key] = {};
    totals[key][e.category] = (totals[key][e.category] || 0) + e.amount;
  });
  const sortedKeys = Array.from(groupKeys).sort().reverse();

  const header = [groupLabel, ...categories, '合計'];
  const bodyRows = sortedKeys.map((key) => {
    const rowTotals = totals[key] || {};
    const values = categories.map((c) => rowTotals[c] || 0);
    const rowTotal = values.reduce((s, v) => s + v, 0);
    return [key, ...values, rowTotal];
  });

  const grandTotals = categories.map((c) => {
    let sum = 0;
    sortedKeys.forEach((k) => { sum += (totals[k] && totals[k][c]) || 0; });
    return sum;
  });
  const grandTotalRow = ['合計', ...grandTotals, grandTotals.reduce((s, v) => s + v, 0)];

  const allRows = [header, ...bodyRows, grandTotalRow];
  const lastCol = columnLetter(header.length - 1);
  const lastRow = allRows.length;

  // 日本語のシート名を含むため、URLパスに使う範囲指定はエンコードする
  const clearRange = encodeURIComponent(`'${sheetName}'!A1:Z5000`);
  const writeRange = encodeURIComponent(`'${sheetName}'!A1:${lastCol}${lastRow}`);

  // カテゴリの増減で列数が変わるため、書き込み前に広めの範囲をクリアしておく
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values/${clearRange}:clear`, {
    method: 'POST',
  });
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values/${writeRange}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: allRows }),
  });
}

export async function updateSummarySheets(spreadsheetId, expenses, categories) {
  await writeGroupedSummary(spreadsheetId, SUMMARY_SHEET, '月', expenses, categories, (date) => (date || '').slice(0, 7) || null);
  await writeGroupedSummary(spreadsheetId, DAILY_SUMMARY_SHEET, '日付', expenses, categories, (date) => date || null);
}

// ---------- レシート画像アップロード ----------

export async function uploadReceipt(folderId, file) {
  const metadata = { name: `${Date.now()}_${file.name}`, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const token = getAccessToken();
  if (!token) throw new AuthError('未ログインです');
  const res = await fetch(`${DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.status === 401) throw new AuthError('認証の有効期限が切れました');
  if (!res.ok) throw new Error(`レシートのアップロードに失敗しました (${res.status})`);
  const data = await res.json();

  // アプリが作成したファイルなので誰でも閲覧できるようにはせず、本人がリンクから開ける状態のままにする
  return { id: data.id, url: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view` };
}
