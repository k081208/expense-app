import { formatYen } from "@/lib/format";

/**
 * 次回の支払予定合計。
 *
 * この画面でいちばん目立つ要素。開いた瞬間に金額が読み取れることを最優先にする。
 * 金額がまだ 1 件も分かっていないときは架空の数字を出さず「¥—」を表示する。
 */
export function PaymentSummary({
  total,
  hasAmount,
  cardCount,
}: {
  total: number;
  /** 金額が分かっているカードが 1 枚でもあるか。 */
  hasAmount: boolean;
  /** 登録されているカードの枚数。 */
  cardCount: number;
}) {
  return (
    <section
      aria-labelledby="payment-summary-heading"
      className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
    >
      <h2
        id="payment-summary-heading"
        className="text-xs font-semibold tracking-wide text-muted"
      >
        次回の支払予定
      </h2>

      <p className="tabular mt-2 text-[2.6rem] leading-[1.15] font-bold tracking-tight break-all">
        {hasAmount ? (
          formatYen(total)
        ) : (
          <span className="text-muted">
            ¥<span className="font-normal">—</span>
          </span>
        )}
      </p>

      <p className="mt-2 text-sm text-muted">
        {cardCount === 0
          ? "カードを登録すると、ここに合計が表示されます"
          : hasAmount
            ? `登録カード ${cardCount} 枚の合計`
            : "請求情報をまだ取得できていません"}
      </p>
    </section>
  );
}
