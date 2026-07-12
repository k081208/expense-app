// アプリ全体の設定値・保存先キーをまとめる小さなモジュール

// 更新のたびに1つずつ増やす。設定画面に表示され、Service Workerのキャッシュ
// バージョンにも使われるため、更新が実機に反映されたか確認できる
export const APP_VERSION = '4';

export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

export const SPREADSHEET_NAME = '経費管理アプリデータ';
export const RECEIPT_FOLDER_NAME = '経費管理アプリ_レシート';
export const APP_TAG = 'keihi-app-v1';

export const DEFAULT_CATEGORIES = ['交通費', '食品代', '酒類', '消耗品費', '交際費', '通信費', 'その他'];

const STORAGE_KEYS = {
  clientId: 'keihi.clientId',
  spreadsheetId: 'keihi.spreadsheetId',
  folderId: 'keihi.folderId',
};

export function getClientId() {
  return localStorage.getItem(STORAGE_KEYS.clientId) || '';
}

export function setClientId(value) {
  localStorage.setItem(STORAGE_KEYS.clientId, value.trim());
}

export function getSpreadsheetId() {
  return localStorage.getItem(STORAGE_KEYS.spreadsheetId) || '';
}

export function setSpreadsheetId(value) {
  localStorage.setItem(STORAGE_KEYS.spreadsheetId, value);
}

export function getFolderId() {
  return localStorage.getItem(STORAGE_KEYS.folderId) || '';
}

export function setFolderId(value) {
  localStorage.setItem(STORAGE_KEYS.folderId, value);
}
