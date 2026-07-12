// Google Sheets API / Drive API とのやり取りをまとめるモジュール
import { getAccessToken } from './auth.js';
import {
  SPREADSHEET_NAME,
  RECEIPT_FOLDER_NAME,
  PROFIT_SPREADSHEET_NAME,
  APP_TAG,
  DEFAULT_CATEGORIES,
  getSpreadsheetId,
  setSpreadsheetId,
  getFolderId,
  setFolderId,
  getProfitSpreadsheetId,
  setProfitSpreadsheetId,
} from './config.js';

export class AuthError extends Error {}

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

const EXPENSES_SHEET = 'Expenses';
const CATEGORIES_SHEET = 'Categories';
const SUMMARY_SHEET = '月次集計';
const DAILY_SUMMARY_SHEET = '日次集計';
const PROFIT_LOSS_SHEET = '収支';
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

// 経費・売上とは別に、家賃や給与などを手入力しつつ最終利益まで見るための
// 専用スプレッドシート
export async function ensureProfitSpreadsheet() {
  let id = getProfitSpreadsheetId();
  if (id) {
    try {
      await authedFetch(`${SHEETS_BASE}/${id}?fields=spreadsheetId`);
      return id;
    } catch (err) {
      if (!(err instanceof AuthError)) setProfitSpreadsheetId('');
      else throw err;
    }
  }

  id = await findAppFile(PROFIT_SPREADSHEET_NAME, 'application/vnd.google-apps.spreadsheet');
  if (!id) {
    const created = await authedFetch(SHEETS_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: PROFIT_SPREADSHEET_NAME },
        sheets: [{ properties: { title: PROFIT_LOSS_SHEET } }],
      }),
    });
    id = created.spreadsheetId;
    await tagFile(id);
  }
  setProfitSpreadsheetId(id);
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

// ---------- 売上シートとの収支計算(専用スプレッドシート) ----------

const SALES_DASHBOARD_SHEET = 'ダッシュボード';
const SALES_SUMMARY_START_ROW = 33; // 売上シート内「月別集計」表のデータ開始行(A:年月 B:総売上 C:総バック額 D:店の純利益)

// A〜E: 自動計算値(年月/総売上/バック額/店の純利益/経費) J: 最終利益(数式)
// F〜I(家賃/給与/光熱費/広告宣伝費)は手入力欄なので、このアプリからは一切書き換えない
const PROFIT_HEADER = ['年月', '総売上', 'キャストバック額', '店の純利益', '経費(アプリ)', '家賃', '給与', '光熱費', '広告宣伝費', '最終利益'];

function parseMoneyCell(v) {
  return Number(String(v == null ? '' : v).replace(/,/g, '')) || 0;
}

async function readSalesMonthlySummary(salesSpreadsheetId) {
  const range = encodeURIComponent(`'${SALES_DASHBOARD_SHEET}'!A${SALES_SUMMARY_START_ROW}:D2000`);
  const data = await authedFetch(`${SHEETS_BASE}/${salesSpreadsheetId}/values/${range}`);
  const rows = data.values || [];
  const byMonth = {};
  rows.forEach((r) => {
    const month = String(r[0] || '').trim();
    if (!/^\d{4}-\d{2}/.test(month)) return;
    byMonth[month.slice(0, 7)] = {
      totalSales: parseMoneyCell(r[1]),
      totalBack: parseMoneyCell(r[2]),
      netProfit: parseMoneyCell(r[3]),
    };
  });
  return byMonth;
}

// 経費アプリ側の月別経費合計と、売上シートの月別集計を「収支」シートに書き出す。
// 家賃・給与・光熱費・広告宣伝費は手入力してもらう前提のため、F〜I列は
// 一度もクリア/上書きしない(A〜EとJのみ更新する)
export async function updateProfitLossSheet(profitSpreadsheetId, salesSpreadsheetId, expenses) {
  await ensureSheetExists(profitSpreadsheetId, PROFIT_LOSS_SHEET);

  const salesByMonth = await readSalesMonthlySummary(salesSpreadsheetId);

  const expenseTotals = {};
  expenses.forEach((e) => {
    const month = (e.date || '').slice(0, 7);
    if (!month) return;
    expenseTotals[month] = (expenseTotals[month] || 0) + e.amount;
  });

  const months = new Set([...Object.keys(expenseTotals), ...Object.keys(salesByMonth)]);
  const sortedMonths = Array.from(months).sort().reverse();
  const lastRow = sortedMonths.length + 1;

  const headerRange = encodeURIComponent(`'${PROFIT_LOSS_SHEET}'!A1:J1`);
  await authedFetch(`${SHEETS_BASE}/${profitSpreadsheetId}/values/${headerRange}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [PROFIT_HEADER] }),
  });

  const dataRows = sortedMonths.map((month) => {
    const sales = salesByMonth[month] || { totalSales: 0, totalBack: 0, netProfit: 0 };
    const expenseTotal = expenseTotals[month] || 0;
    return [month, sales.totalSales, sales.totalBack, sales.netProfit, expenseTotal];
  });
  const clearRangeAE = encodeURIComponent(`'${PROFIT_LOSS_SHEET}'!A2:E2000`);
  await authedFetch(`${SHEETS_BASE}/${profitSpreadsheetId}/values/${clearRangeAE}:clear`, { method: 'POST' });
  if (dataRows.length) {
    const writeRangeAE = encodeURIComponent(`'${PROFIT_LOSS_SHEET}'!A2:E${lastRow}`);
    await authedFetch(`${SHEETS_BASE}/${profitSpreadsheetId}/values/${writeRangeAE}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: dataRows }),
    });
  }

  // J列(最終利益) = D(店の純利益) - E(経費) - F(家賃) - G(給与) - H(光熱費) - I(広告宣伝費)
  const formulaRows = sortedMonths.map((_, i) => {
    const row = i + 2;
    return [`=D${row}-E${row}-F${row}-G${row}-H${row}-I${row}`];
  });
  const clearRangeJ = encodeURIComponent(`'${PROFIT_LOSS_SHEET}'!J2:J2000`);
  await authedFetch(`${SHEETS_BASE}/${profitSpreadsheetId}/values/${clearRangeJ}:clear`, { method: 'POST' });
  if (formulaRows.length) {
    const writeRangeJ = encodeURIComponent(`'${PROFIT_LOSS_SHEET}'!J2:J${lastRow}`);
    await authedFetch(`${SHEETS_BASE}/${profitSpreadsheetId}/values/${writeRangeJ}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: formulaRows }),
    });
  }
}

// 経費スプレッドシート内に以前作った簡易版「収支」タブは今後使わないため、
// 存在すれば削除しておく(専用スプレッドシートに移行したため)
export async function removeSheetIfExists(spreadsheetId, sheetName) {
  const meta = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties`);
  const sheet = meta.sheets.find((s) => s.properties.title === sheetName);
  if (!sheet) return;
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ deleteSheet: { sheetId: sheet.properties.sheetId } }],
    }),
  });
}

// ---------- レシート画像アップロード ----------

// Googleドライブの容量を圧迫しすぎないよう、文字が読める程度の画質を保ちつつ
// アップロード前に縮小・再圧縮する。失敗した場合は元のファイルをそのまま使う
async function compressImageForUpload(file, maxDim = 1800, quality = 0.8) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の圧縮に失敗しました'))), 'image/jpeg', quality);
    });
    const baseName = (file.name || 'receipt').replace(/\.\w+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch (err) {
    return file;
  }
}

export async function uploadReceipt(folderId, file) {
  const compressed = await compressImageForUpload(file);
  const metadata = { name: `${Date.now()}_${compressed.name}`, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', compressed);

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
