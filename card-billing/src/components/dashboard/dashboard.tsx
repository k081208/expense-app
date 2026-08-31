import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { UserBadge } from "@/components/auth/user-badge";
import { AccountCard } from "@/components/auth/account-card";
import { PaymentSummary } from "@/components/dashboard/payment-summary";
import { PaymentDateSummary } from "@/components/dashboard/payment-date-summary";
import { CardBillingItem } from "@/components/dashboard/card-billing-item";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { RefreshPanel } from "@/components/dashboard/refresh-panel";
import type { PaymentDateGroup } from "@/lib/dashboard/summary";
import { hasAnyAmount } from "@/lib/dashboard/summary";
import type { AppUser } from "@/lib/auth/session";
import type { CardBillingSummary } from "@/types/billing";

/**
 * ダッシュボードの画面。
 *
 * 渡されたデータを表示するだけで、Supabase へは問い合わせない。
 * データの取得はページ（Server Component）側で行い、ここへ渡す。
 * これにより STEP 6 以降でデータの出どころを差し替えても、この画面は変わらない。
 *
 * 並びは上から
 *   ヘッダー / 次回支払予定 / 支払日別 / カード一覧 / 更新（＋最終更新） / アカウント
 * とし、開いた瞬間に合計金額が目に入るようにしている。
 */
export function Dashboard({
  user,
  cards,
  total,
  byPaymentDate,
  lastUpdatedAt,
  profileMissing,
  now,
}: {
  user: AppUser;
  cards: CardBillingSummary[];
  total: number;
  byPaymentDate: PaymentDateGroup[];
  lastUpdatedAt: string | null;
  profileMissing?: boolean;
  now?: Date;
}) {
  const isEmpty = cards.length === 0;

  return (
    <AppShell title="カード請求まとめ" action={<UserBadge user={user} />}>
      <div className="space-y-4">
        <PaymentSummary
          total={total}
          hasAmount={hasAnyAmount(cards)}
          cardCount={cards.length}
        />

        <PaymentDateSummary groups={byPaymentDate} />

        {isEmpty ? (
          <DashboardEmptyState />
        ) : (
          <section aria-labelledby="cards-heading">
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h2
                id="cards-heading"
                className="text-xs font-semibold tracking-wide text-muted"
              >
                登録カード
              </h2>
              {/* 合計金額より目立たないよう、小さな文字リンクにする */}
              <Link
                href="/cards"
                className="rounded px-1 text-xs text-muted underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                カード管理
              </Link>
            </div>
            <ul className="space-y-3">
              {cards.map((card) => (
                <CardBillingItem key={card.cardId} card={card} now={now} />
              ))}
            </ul>
          </section>
        )}

        {/* 更新処理そのものは STEP 10。ここでは UI だけを置く。 */}
        <RefreshPanel lastUpdatedAt={lastUpdatedAt} now={now} />

        <AccountCard user={user} profileMissing={profileMissing} />
      </div>
    </AppShell>
  );
}
