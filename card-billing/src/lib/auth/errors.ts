/**
 * 認証まわりのエラー表示。
 *
 * 画面にもクエリ文字列にも、内部の詳細（スタックトレース・トークン・OAuth code）
 * は一切載せない。ここで定義した短いコードだけをやり取りし、文言に変換する。
 */

export const AUTH_ERROR_CODES = [
  /** ユーザーが Google の同意画面をキャンセルした */
  "cancelled",
  /** コールバックに code が無い */
  "missing_code",
  /** code からセッションへの交換に失敗した */
  "exchange_failed",
  /** OAuth の開始に失敗した（Supabase 側の設定不足など） */
  "oauth_start_failed",
  /** ログイン後にユーザー情報を取得できなかった */
  "user_unavailable",
  /** 分類できないもの */
  "unknown",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

const MESSAGES: Record<AuthErrorCode, string> = {
  cancelled: "ログインがキャンセルされました。もう一度お試しください。",
  missing_code: "ログインを完了できませんでした。もう一度お試しください。",
  exchange_failed: "ログインを完了できませんでした。もう一度お試しください。",
  oauth_start_failed:
    "ログインを開始できませんでした。時間をおいて、もう一度お試しください。",
  user_unavailable:
    "ユーザー情報を取得できませんでした。もう一度ログインしてください。",
  unknown: "ログインできませんでした。もう一度お試しください。",
};

/** クエリ文字列の値が既知のコードかどうか。 */
export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return (
    typeof value === "string" &&
    (AUTH_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** 未知の値は "unknown" に丸めたうえで、ユーザー向けの文言を返す。 */
export function authErrorMessage(value: unknown): string {
  return MESSAGES[isAuthErrorCode(value) ? value : "unknown"];
}
