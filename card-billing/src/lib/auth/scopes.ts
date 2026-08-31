/**
 * ログインで要求する Google のスコープ。
 *
 * ログインに必要な最小限だけを要求する。
 * Gmail・Drive・Calendar などの権限はここに追加しないこと。
 *
 * Gmail の読み取り権限は STEP 7 で、ログインとは別の「Gmail 連携」として
 * 改めて同意を求める（連携情報は connections / private.oauth_credentials で管理する）。
 */
export const LOGIN_SCOPES = "openid email profile";
