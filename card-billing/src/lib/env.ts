/**
 * 環境変数の読み取り。
 *
 * - `NEXT_PUBLIC_` が付いたものだけがブラウザに露出する。
 *   サービスロールキーや OAuth クライアントシークレットには絶対に付けないこと。
 * - サーバー専用の値は `serverEnv()` 経由でのみ読む。クライアントコンポーネントから
 *   呼ぶとビルド時に解決されず undefined になるため、事故に気付きやすい。
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `環境変数 ${name} が設定されていません。.env.local を確認してください。`,
    );
  }
  return value;
}

/** ブラウザからも参照してよい公開設定。 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

/** 公開設定が揃っているか（セットアップ状況の表示に使う）。 */
export function hasPublicSupabaseEnv(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

export function requirePublicEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", publicEnv.supabaseUrl),
    supabaseAnonKey: required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      publicEnv.supabaseAnonKey,
    ),
    appUrl: publicEnv.appUrl,
  };
}

/**
 * サーバー専用の秘密情報。
 * このモジュールを Client Component から import しないこと。
 */
export function serverEnv() {
  return {
    supabaseServiceRoleKey: required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    googleClientId: required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID),
    googleClientSecret: required(
      "GOOGLE_CLIENT_SECRET",
      process.env.GOOGLE_CLIENT_SECRET,
    ),
    /** connections テーブルのトークンを暗号化するための鍵 (32byte / base64)。 */
    tokenEncryptionKey: required(
      "TOKEN_ENCRYPTION_KEY",
      process.env.TOKEN_ENCRYPTION_KEY,
    ),
    /** 自動更新エンドポイントを保護する共有シークレット。 */
    cronSecret: required("CRON_SECRET", process.env.CRON_SECRET),
  };
}

/** サーバー専用環境変数のうち、未設定のものの名前を返す（セットアップ状況の表示用）。 */
export function missingServerEnv(): string[] {
  return [
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "CRON_SECRET",
  ].filter((name) => !process.env[name]);
}
