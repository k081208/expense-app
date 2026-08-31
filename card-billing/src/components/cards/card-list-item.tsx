import Link from "next/link";
import { setCardEnabled } from "@/lib/cards/actions";
import { providerLabel } from "@/lib/cards/catalog";
import { formatLastFour } from "@/lib/format";
import type { CardRow } from "@/types/database";

/**
 * カード管理画面の 1 行。
 *
 * 無効なカードもここには表示する（ダッシュボードには出ない）。
 * 有効・無効は色ではなく文言で示す。
 */
export function CardListItem({ card }: { card: CardRow }) {
  const lastFour = formatLastFour(card.last_four);

  return (
    <li className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold break-words">
            {card.display_name}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {providerLabel(card.provider_key)}
          </p>
        </div>
        {card.enabled ? null : (
          <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
            使用しない
          </span>
        )}
      </div>

      <dl className="mt-3 space-y-1 text-sm text-muted">
        {lastFour ? (
          <div className="flex gap-2">
            <dt className="shrink-0">カード番号</dt>
            <dd className="tabular">{lastFour}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="shrink-0">支払日</dt>
          <dd>{card.payment_day ? `毎月${card.payment_day}日` : "未設定"}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/cards/${card.id}/edit`}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          編集
        </Link>

        <form action={setCardEnabled}>
          <input type="hidden" name="cardId" value={card.id} />
          <input
            type="hidden"
            name="enabled"
            value={card.enabled ? "false" : "true"}
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {card.enabled ? "使用しない" : "使用する"}
            <span className="sr-only">（{card.display_name}）</span>
          </button>
        </form>
      </div>
    </li>
  );
}
