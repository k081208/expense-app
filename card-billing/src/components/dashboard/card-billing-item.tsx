import type { CardBillingSummary } from "@/types/billing";
import { providerErrorMessage } from "@/providers/errors";
import {
  formatLastFour,
  formatLastUpdated,
  formatPaymentDate,
  formatYen,
} from "@/lib/format";

/**
 * カード 1 枚分の表示。
 *
 * 表示できる状態:
 *   - 金額あり            … 金額と支払日を出す
 *   - 金額あり（確定前）  … 「暫定」を添える。警告ではなく通常の状態として扱う
 *   - 金額なし            … 「請求金額はまだ確定していません」等の理由を出す
 *   - 取得失敗            … 「情報を更新できませんでした」等を出す
 *
 * 状態は色だけでなく必ず文字でも示す。内部のエラーコードは画面に出さず、
 * providers/errors.ts のユーザー向け文言に変換して表示する。
 */

/** カードの識別を助ける装飾用の色。意味は持たせない（状態は文字で示す）。 */
const ACCENTS = [
  "#2563eb",
  "#0891b2",
  "#059669",
  "#d97706",
  "#db2777",
  "#7c3aed",
] as const;

function accentFor(providerKey: string): string {
  let hash = 0;
  for (let i = 0; i < providerKey.length; i++) {
    hash = (hash * 31 + providerKey.charCodeAt(i)) >>> 0;
  }
  return ACCENTS[hash % ACCENTS.length];
}

/** 金額が取れていないときに出す説明。 */
function unavailableText(card: CardBillingSummary): string {
  if (card.status === "unknown") return "まだ取得していません";
  if (card.status === "error") return providerErrorMessage(card.errorCode ?? "unknown");
  return "請求金額を取得できていません";
}

export function CardBillingItem({
  card,
  now,
}: {
  card: CardBillingSummary;
  /** 「本日 21:42」の判定に使う基準時刻。テストで固定できるようにしている。 */
  now?: Date;
}) {
  const showsAmount = card.status === "success" && card.amount !== null;
  const lastFour = formatLastFour(card.lastFour);

  return (
    <li className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 pl-6 shadow-sm">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: accentFor(card.provider) }}
      />

      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 text-base font-semibold break-words">
          {card.displayName}
        </h3>
        {lastFour ? (
          <span className="tabular shrink-0 text-xs text-muted">{lastFour}</span>
        ) : null}
      </div>

      {showsAmount ? (
        <>
          <p className="tabular mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-3xl font-bold tracking-tight break-all">
            {formatYen(card.amount)}
            {card.isProvisional ? (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tracking-normal text-muted">
                暫定
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-muted">
            {card.paymentDate
              ? `${formatPaymentDate(card.paymentDate)} 支払い`
              : formatPaymentDate(null)}
          </p>
          {card.isProvisional ? (
            <p className="mt-1 text-xs text-muted">
              確定前の見込み額です。確定後に変わることがあります。
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
            className="mt-0.5 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M10 2a8 8 0 100 16 8 8 0 000-16zm.9 5.6a.9.9 0 10-1.8 0 .9.9 0 001.8 0zM9.1 9.5a.9.9 0 011.8 0v4.1a.9.9 0 11-1.8 0V9.5z"
              clipRule="evenodd"
            />
          </svg>
          <span>{unavailableText(card)}</span>
        </p>
      )}

      {/*
        請求情報を取得できていない間は、登録時の「毎月○日」を目安として出す。
        これは正式な支払日 (paymentDate) ではないため、表記を分けている。
      */}
      {!showsAmount && card.paymentDay ? (
        <p className="mt-1 text-sm text-muted">毎月{card.paymentDay}日 支払い</p>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        最終更新：{formatLastUpdated(card.fetchedAt, now)}
      </p>
    </li>
  );
}
