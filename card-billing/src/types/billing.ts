/**
 * アプリ全体で共有する「請求情報」の共通データ形式。
 *
 * 取得元(公式API / Gmail)がどれであっても、Provider 層は必ずこの形式に
 * 正規化して返す。UI 側は取得元を意識せず、この型だけを扱う。
 */

/** 請求情報の取得元。優先順位は api > gmail（`SOURCE_PRIORITY` 参照）。 */
export type BillingSource = "api" | "gmail";

/** 取得結果の状態。 */
export type BillingStatus = "success" | "error";

/**
 * 取得元の優先度。数値が大きいほど優先される。
 * 同じカード・同じ支払日の請求が複数の取得元から得られた場合、
 * この値が大きい方を採用する（API の値をメールの値で上書きしない）。
 */
export const SOURCE_PRIORITY: Record<BillingSource, number> = {
  api: 2,
  gmail: 1,
};

/**
 * 正規化済みの請求情報 1 件。
 *
 * 仕様書の共通データ形式に対応する:
 * { cardId, provider, amount, paymentDate, source, fetchedAt, status }
 */
export type NormalizedBilling = {
  /** cards.id (UUID) */
  cardId: string;
  /** Provider の識別キー。例: "rakuten" / "smbc" / "amex" / "paypay" */
  provider: string;
  /** 請求金額（円・整数）。未確定・取得失敗時は null。 */
  amount: number | null;
  /** 支払日。ISO 8601 の日付のみ("YYYY-MM-DD")。不明な場合は null。 */
  paymentDate: string | null;
  /** 取得元 */
  source: BillingSource;
  /** 取得日時。ISO 8601 (UTC)。 */
  fetchedAt: string;
  /** 取得結果 */
  status: BillingStatus;
  /**
   * 金額が確定前（速報値・見込み額）かどうか。
   * カード会社によっては確定前の案内メールが先に届くため、UI で注記できるようにする。
   */
  isProvisional?: boolean;
  /**
   * status === "error" のときの理由。ユーザーに見せる文言はここから組み立てず、
   * `providerErrorMessage()` などの表示用ヘルパを通すこと（機密情報の漏洩防止）。
   */
  errorCode?: string;
};

/** ダッシュボード 1 行分（カード + 最新の請求情報）の表示用モデル。 */
export type CardBillingSummary = {
  cardId: string;
  provider: string;
  /** ユーザーが付けたカードの表示名。例: "楽天カード" */
  displayName: string;
  /** カード番号の下 4 桁のみ。未登録なら null。 */
  lastFour: string | null;
  amount: number | null;
  paymentDate: string | null;
  source: BillingSource | null;
  fetchedAt: string | null;
  status: BillingStatus | "unknown";
  /** 確定前の速報値・見込み額なら true。 */
  isProvisional: boolean;
  /** status === "error" のときの理由（ProviderErrorCode）。表示は必ず変換して行う。 */
  errorCode: string | null;
};

/** 支払日ごとの合計（「9月10日 ¥181,000」の集計行）。 */
export type PaymentDateTotal = {
  /** "YYYY-MM-DD" */
  paymentDate: string;
  /** 合計金額（円）。 */
  total: number;
  /** この支払日に含まれるカード枚数。 */
  cardCount: number;
};

/** ダッシュボードに渡す集計結果一式。 */
export type DashboardSummary = {
  /** 次回支払予定の合計金額（円）。 */
  total: number;
  cards: CardBillingSummary[];
  byPaymentDate: PaymentDateTotal[];
  /** 全カード中もっとも古い取得日時（= 実質的な最終更新）。 */
  lastUpdatedAt: string | null;
  /** 取得に失敗しているカードが 1 枚でもあるか。 */
  hasError: boolean;
};
