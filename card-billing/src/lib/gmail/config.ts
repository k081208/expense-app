/**
 * Gmail 連携の設定値。
 *
 * 【STEP 3 のログインとの違い】
 *   STEP 3 … このアプリへログインするための Google 認証（Supabase Auth）
 *   ここ  … 請求メールを読むための、外部 Google API への認可（Connection）
 *
 * 両者は責務が別なので、OAuth クライアントも認可フローも完全に分けている。
 * ログイン用のスコープ（src/lib/auth/scopes.ts）は変更しない。
 */

/**
 * Gmail 連携で要求するスコープ。
 *
 * - `gmail.readonly` … 請求メールを読むためだけの権限。
 *   送信・削除・編集・ラベル変更の権限は要求しない。
 * - `openid` / `email` … 連携先アカウントを識別するため
 *   （安定した一意 ID である sub と、表示用のメールアドレスを取得する）。
 *
 * `profile` は要求しない。表示名やプロフィール写真は Gmail 連携に不要なため。
 */
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

/** 付与された権限にこれが含まれていなければ、連携成功として扱わない。 */
export const REQUIRED_GMAIL_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";

/** Google の各エンドポイント。 */
export const GOOGLE_ENDPOINTS = {
  authorize: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  revoke: "https://oauth2.googleapis.com/revoke",
  jwks: "https://www.googleapis.com/oauth2/v3/certs",
  /** 疎通確認だけに使う軽量なエンドポイント（メールの中身は取得しない）。 */
  gmailProfile: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
} as const;

/** ID トークンの発行者。Google は歴史的経緯で 2 通りを使う。 */
export const GOOGLE_ISSUERS = [
  "https://accounts.google.com",
  "accounts.google.com",
] as const;

/** 連携に使う Cookie の名前（いずれも HttpOnly・短命）。 */
export const OAUTH_COOKIE = {
  state: "gmail_oauth_state",
  codeVerifier: "gmail_oauth_verifier",
} as const;

/** OAuth の途中経過を保持する時間。完了に十分で、かつ短く。 */
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

/**
 * アクセストークンをどれだけ手前で更新するか。
 * 期限ぎりぎりで使うと、通信中に切れることがあるため余裕を持たせる。
 */
export const ACCESS_TOKEN_REFRESH_MARGIN_SECONDS = 120;

/** 連携の設定画面のパス。 */
export const CONNECTIONS_PATH = "/settings/connections";
