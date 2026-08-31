import type { PaymentDateGroup } from "@/lib/dashboard/summary";
import { formatPaymentDate, formatYen } from "@/lib/format";

/**
 * 支払日別の集計。
 *
 * 「その日に銀行口座からいくら引き落とされるのか」を把握するための表示。
 * カード一覧とは別に、日付ごとの合計だけを並べる。
 */
export function PaymentDateSummary({ groups }: { groups: PaymentDateGroup[] }) {
  return (
    <section
      aria-labelledby="payment-date-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <h2
        id="payment-date-heading"
        className="mb-3 text-xs font-semibold tracking-wide text-muted"
      >
        支払日別
      </h2>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">支払予定はまだありません</p>
      ) : (
        <ul className="divide-y divide-border">
          {groups.map((group) => (
            <li
              key={group.paymentDate}
              className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="text-sm font-medium">
                {formatPaymentDate(group.paymentDate)}
                <span className="ml-2 text-xs font-normal text-muted">
                  {group.cardCount} 枚
                </span>
              </span>
              <span className="tabular shrink-0 text-lg font-bold tracking-tight">
                {formatYen(group.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
