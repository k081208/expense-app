/**
 * Gmail 連携のエラー表示。
 *
 * 画面にもクエリ文字列にも内部の詳細（Google の生エラー・トークン・認可コード）は
 * 一切載せない。短いコードだけをやり取りし、ここで文言に変換する。
 */

export const GMAIL_ERROR_CODES = [
  /** 利用者が Google の同意画面で拒否した */
  "access_denied",
  /** state が一致しない（不正なコールバック） */
  "state_mismatch",
  /** コールバックに認可コードが無い */
  "missing_code",
  /** 認可コードとトークンの交換に失敗した */
  "token_exchange_failed",
  /** ID トークンを検証できなかった */
  "id_token_invalid",
  /** Gmail の読み取り権限が付与されなかった */
  "missing_gmail_scope",
  /** 初回なのにリフレッシュトークンを取得できなかった */
  "missing_refresh_token",
  /** メールアドレスが未確認だった */
  "email_unverified",
  /** Gmail API へアクセスできなかった */
  "gmail_unreachable",
  /** 連携情報を保存できなかった */
  "save_failed",
  /** ログインの有効期限が切れた */
  "session_expired",
  /** 連携の設定が済んでいない（環境変数など） */
  "not_configured",
  /** 分類できないもの */
  "unknown",
] as const;

export type GmailErrorCode = (typeof GMAIL_ERROR_CODES)[number];

const MESSAGES: Record<GmailErrorCode, string> = {
  access_denied:
    "Gmail の連携がキャンセルされました。もう一度お試しください。",
  state_mismatch:
    "連携を完了できませんでした。お手数ですが、最初からやり直してください。",
  missing_code:
    "連携を完了できませんでした。お手数ですが、最初からやり直してください。",
  token_exchange_failed:
    "Google との連携に失敗しました。時間をおいて、もう一度お試しください。",
  id_token_invalid:
    "Google アカウントを確認できませんでした。もう一度お試しください。",
  missing_gmail_scope:
    "Gmail を読み取る権限が許可されませんでした。連携の途中で表示される確認画面で、Gmail の閲覧を許可してください。",
  missing_refresh_token:
    "自動更新に必要な情報を取得できませんでした。もう一度「Gmail アカウントを追加」からやり直してください。",
  email_unverified:
    "この Google アカウントはメールアドレスが未確認のため連携できません。",
  gmail_unreachable:
    "Gmail に接続できませんでした。時間をおいて、もう一度お試しください。",
  save_failed:
    "連携情報を保存できませんでした。時間をおいて、もう一度お試しください。",
  session_expired:
    "ログインの有効期限が切れました。もう一度ログインしてからお試しください。",
  not_configured:
    "Gmail 連携の設定が済んでいません。README の手順に沿って設定してください。",
  unknown: "連携できませんでした。もう一度お試しください。",
};

export function isGmailErrorCode(value: unknown): value is GmailErrorCode {
  return (
    typeof value === "string" &&
    (GMAIL_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** 未知の値は "unknown" に丸めたうえで、ユーザー向けの文言を返す。 */
export function gmailErrorMessage(value: unknown): string {
  return MESSAGES[isGmailErrorCode(value) ? value : "unknown"];
}
