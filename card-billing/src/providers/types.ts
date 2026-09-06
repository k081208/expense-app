import type { BillingSource, NormalizedBilling } from "@/types/billing";
import type { ProviderErrorCode } from "./errors";

/**
 * カード会社ごとの取得処理の共通インターフェース。
 *
 * 公式 API 連携(`api/`)もメール解析(`gmail/`)も、この形に揃えることで
 * 呼び出し側(`services/refresh.ts`)はカード会社を意識せずに扱える。
 * 新しいカード会社を追加するときは、このインターフェースを実装したファイルを
 * 1 つ追加し `registry.ts` に登録するだけでよい。
 */

/** Provider の実行に必要な文脈。Provider 自身は DB へ直接アクセスしない。 */
export type ProviderContext = {
  /** 対象カード (cards.id) */
  cardId: string;
  /** 所有ユーザー (auth.users.id)。ログ出力時は識別子のみ使用する。 */
  userId: string;
  /**
   * 連携済みアカウントのアクセストークン取得関数。
   * 期限切れ時のリフレッシュは呼び出し側が行い、Provider は常に有効な値を受け取る。
   * 未連携の場合は `null` を返す。
   */
  getAccessToken: () => Promise<string | null>;
  /** 取得の基準日時。テスト時に固定できるよう外から渡す。 */
  now: Date;
  /** 1 回の取得にかけてよい時間 (ms)。 */
  timeoutMs: number;
};

/** 金額のみを取得した結果。 */
export type AmountResult = {
  /** 円・整数。未確定なら null。 */
  amount: number | null;
  /** 確定前の速報値なら true。 */
  isProvisional: boolean;
};

/** 支払日のみを取得した結果。 */
export type PaymentDateResult = {
  /** "YYYY-MM-DD"。不明なら null。 */
  paymentDate: string | null;
};

/** `refresh()` の戻り値。成功時も失敗時もこの形で返す（例外を投げない）。 */
export type RefreshResult =
  | { ok: true; billing: NormalizedBilling }
  | { ok: false; code: ProviderErrorCode; billing: NormalizedBilling };

/** `healthCheck()` の戻り値。 */
export type HealthCheckResult = {
  healthy: boolean;
  /** 異常時の分類。 */
  code?: ProviderErrorCode;
  checkedAt: string;
};

export interface BillingProvider {
  /** Provider を一意に識別するキー。例: "rakuten"。cards.provider_key と対応する。 */
  readonly key: string;
  /** 画面に表示するカード会社名。例: "楽天カード" */
  readonly displayName: string;
  /** この Provider の取得元。 */
  readonly source: BillingSource;

  /** 次回請求金額を取得する。 */
  fetchBillingAmount(ctx: ProviderContext): Promise<AmountResult>;

  /** 次回支払日を取得する。 */
  fetchPaymentDate(ctx: ProviderContext): Promise<PaymentDateResult>;

  /**
   * 金額と支払日をまとめて取得し、共通形式に正規化して返す。
   * 失敗しても例外を投げず、`{ ok: false }` を返すこと。
   */
  refresh(ctx: ProviderContext): Promise<RefreshResult>;

  /** 連携が生きているかを軽量に確認する。 */
  healthCheck(ctx: ProviderContext): Promise<HealthCheckResult>;
}
