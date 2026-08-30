/**
 * Provider 層で発生しうるエラーの分類。
 *
 * 1 枚のカードの取得が失敗してもアプリ全体が停止しないよう、Provider は
 * 例外を投げっぱなしにせず `ProviderError` に包んで返すことを基本とする。
 */

export type ProviderErrorCode =
  /** Gmail / API との連携が切れている（未接続・連携解除済み） */
  | "not_connected"
  /** OAuth のアクセストークン期限切れ・リフレッシュ失敗 */
  | "token_expired"
  /** 権限（スコープ）不足 */
  | "insufficient_scope"
  /** カード会社 API / Gmail API がエラーを返した */
  | "upstream_error"
  /** レート制限 */
  | "rate_limited"
  /** カード会社側がメンテナンス中 */
  | "maintenance"
  /** 対象のメールが見つからなかった */
  | "mail_not_found"
  /** メールは見つかったが金額を抽出できなかった */
  | "amount_parse_failed"
  /** メールは見つかったが支払日を抽出できなかった */
  | "payment_date_parse_failed"
  /** 金額が未確定（確定前） */
  | "amount_not_finalized"
  /** タイムアウト */
  | "timeout"
  /** 分類できないもの */
  | "unknown";

/** ユーザー向け表示文言。機密情報や内部詳細は絶対に含めない。 */
const MESSAGES: Record<ProviderErrorCode, string> = {
  not_connected: "連携が設定されていません",
  token_expired: "連携の有効期限が切れました。再連携してください",
  insufficient_scope: "必要な権限が許可されていません",
  upstream_error: "情報を更新できませんでした",
  rate_limited: "アクセスが集中しています。しばらくしてからお試しください",
  maintenance: "カード会社がメンテナンス中です",
  mail_not_found: "請求のお知らせメールが見つかりませんでした",
  amount_parse_failed: "請求金額を読み取れませんでした",
  payment_date_parse_failed: "支払日を読み取れませんでした",
  amount_not_finalized: "請求金額はまだ確定していません",
  timeout: "情報を更新できませんでした",
  unknown: "情報を更新できませんでした",
};

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  /** 時間をおけば解決する可能性があるか（自動更新のリトライ判断に使う）。 */
  readonly retryable: boolean;

  constructor(
    code: ProviderErrorCode,
    /** 開発者向けの詳細。ログに出す際は必ずマスク済みの内容にすること。 */
    message?: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message ?? code, { cause: options?.cause });
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options?.retryable ?? RETRYABLE.has(code);
  }
}

const RETRYABLE = new Set<ProviderErrorCode>([
  "upstream_error",
  "rate_limited",
  "maintenance",
  "timeout",
  "amount_not_finalized",
]);

/** 任意の例外を `ProviderError` に正規化する。 */
export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Error) {
    return new ProviderError("unknown", error.message, { cause: error });
  }
  return new ProviderError("unknown");
}

/** エラーコードからユーザー向けの表示文言を返す。 */
export function providerErrorMessage(code: ProviderErrorCode | string): string {
  return MESSAGES[code as ProviderErrorCode] ?? MESSAGES.unknown;
}
