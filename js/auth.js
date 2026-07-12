// Google Identity Services (GIS) のトークンクライアントをラップする認証モジュール
import { SCOPES } from './config.js';

let tokenClient = null;
let currentToken = null; // { access_token, expiresAt }
let tokenListeners = [];

function notify(state) {
  tokenListeners.forEach((fn) => fn(state));
}

export function onAuthChange(fn) {
  tokenListeners.push(fn);
}

export function isSignedIn() {
  return !!(currentToken && currentToken.access_token && currentToken.expiresAt > Date.now());
}

export function getAccessToken() {
  return isSignedIn() ? currentToken.access_token : null;
}

function waitForGis(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        reject(new Error('Google Identity Services を読み込めませんでした。通信環境を確認してください。'));
      } else {
        setTimeout(check, 100);
      }
    })();
  });
}

export async function initAuth(clientId) {
  await waitForGis();
  return new Promise((resolve, reject) => {
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: () => {}, // requestAccessToken 呼び出し時に都度上書きする
      });
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function requestToken(promptMode) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('認証が初期化されていません'));
      return;
    }
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error));
        return;
      }
      currentToken = {
        access_token: resp.access_token,
        expiresAt: Date.now() + (Number(resp.expires_in) - 60) * 1000,
      };
      notify('signed-in');
      resolve(currentToken.access_token);
    };
    tokenClient.error_callback = (err) => {
      reject(err);
    };
    tokenClient.requestAccessToken({ prompt: promptMode });
  });
}

// アプリ起動時にサイレントでのトークン取得を試みる（過去に同意済みなら画面を出さずに済む）
export async function trySilentSignIn() {
  try {
    await requestToken('');
    return true;
  } catch (err) {
    return false;
  }
}

export async function signIn() {
  return requestToken('consent');
}

export async function ensureToken() {
  if (isSignedIn()) return currentToken.access_token;
  return requestToken('');
}

export function signOut() {
  const token = currentToken?.access_token;
  currentToken = null;
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  notify('signed-out');
}
