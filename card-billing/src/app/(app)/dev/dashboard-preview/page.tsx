import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { PaymentSummary } from "@/components/dashboard/payment-summary";
import { PaymentDateSummary } from "@/components/dashboard/payment-date-summary";
import { CardBillingItem } from "@/components/dashboard/card-billing-item";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { RefreshPanel } from "@/components/dashboard/refresh-panel";
import { groupByPaymentDate, totalAmount } from "@/lib/dashboard/summary";
import type { CardBillingSummary } from "@/types/billing";

export const dynamic = "force-dynamic";

/**
 * ダッシュボード各部品の状態確認用プレビュー（開発時のみ）。
 *
 * 金額あり・未確定・暫定・取得失敗・長いカード名など、実際には作りにくい
 * 状態でもレイアウトが崩れないことを確認するためのもの。
 *
 * 本番では 404 を返すため、ここに置いたテスト用の値が利用者の画面へ
 * 出ることはない。ダッシュボード本体（/）は常に実データのみを表示する。
 */

const NOW = new Date("2026-08-31T12:42:00Z"); // JST 21:42

function card(overrides: Partial<CardBillingSummary>): CardBillingSummary {
  return {
    cardId: Math.random().toString(36).slice(2),
    provider: "sample",
    displayName: "サンプルカード",
    lastFour: null,
    amount: null,
    paymentDate: null,
    source: "gmail",
    fetchedAt: "2026-08-31T12:40:00Z",
    status: "success",
    isProvisional: false,
    errorCode: null,
    ...overrides,
  };
}

const SAMPLES: Array<{ label: string; card: CardBillingSummary }> = [
  {
    label: "金額あり・下4桁あり・支払日あり",
    card: card({
      provider: "rakuten",
      displayName: "楽天カード",
      lastFour: "1234",
      amount: 82400,
      paymentDate: "2026-09-27",
    }),
  },
  {
    label: "金額あり・下4桁なし",
    card: card({
      provider: "smbc",
      displayName: "三井住友カード",
      amount: 54200,
      paymentDate: "2026-09-10",
    }),
  },
  {
    label: "暫定（確定前の見込み額）",
    card: card({
      provider: "amex",
      displayName: "AMEX",
      lastFour: "9876",
      amount: 126800,
      paymentDate: "2026-09-10",
      isProvisional: true,
      source: "api",
    }),
  },
  {
    label: "金額が高額（桁あふれの確認）",
    card: card({
      provider: "jcb",
      displayName: "JCBカード",
      amount: 12345678,
      paymentDate: "2026-09-27",
    }),
  },
  {
    label: "0 円（未取得ではなく確定値）",
    card: card({
      provider: "paypay",
      displayName: "PayPayカード",
      amount: 0,
      paymentDate: "2026-09-27",
    }),
  },
  {
    label: "金額未確定（取得はできたが確定前）",
    card: card({
      provider: "epos",
      displayName: "エポスカード",
      status: "error",
      errorCode: "amount_not_finalized",
    }),
  },
  {
    label: "取得失敗（メールが見つからない）",
    card: card({
      provider: "aeon",
      displayName: "イオンカード",
      status: "error",
      errorCode: "mail_not_found",
    }),
  },
  {
    label: "取得失敗（連携切れ）",
    card: card({
      provider: "orico",
      displayName: "オリコカード",
      status: "error",
      errorCode: "token_expired",
      fetchedAt: "2026-08-28T12:40:00Z",
    }),
  },
  {
    label: "支払日なし・金額あり",
    card: card({
      provider: "view",
      displayName: "ビューカード",
      amount: 31500,
      paymentDate: null,
    }),
  },
  {
    label: "未取得（一度も更新していない）",
    card: card({
      provider: "dcard",
      displayName: "dカード",
      status: "unknown",
      fetchedAt: null,
    }),
  },
  {
    label: "長いカード名（折り返しの確認）",
    card: card({
      provider: "long",
      displayName: "セゾンプラチナ・ビジネス・アメリカン・エキスプレス・カード",
      lastFour: "4321",
      amount: 298000,
      paymentDate: "2026-09-04",
    }),
  },
];

export default async function DashboardPreviewPage() {
  // 本番では存在しないページとして扱う
  if (process.env.NODE_ENV !== "development") notFound();

  const cards = SAMPLES.map((sample) => sample.card);

  return (
    <AppShell
      title="ダッシュボード部品プレビュー"
      subtitle="開発時のみ表示されます"
    >
      <div className="space-y-8">
        <div className="space-y-4">
          <p className="px-1 text-xs font-semibold tracking-wide text-muted">
            集計部分（データあり）
          </p>
          <PaymentSummary
            total={totalAmount(cards)}
            hasAmount
            cardCount={cards.length}
          />
          <PaymentDateSummary groups={groupByPaymentDate(cards)} />
        </div>

        <div className="space-y-4">
          <p className="px-1 text-xs font-semibold tracking-wide text-muted">
            集計部分（データなし）
          </p>
          <PaymentSummary total={0} hasAmount={false} cardCount={0} />
          <PaymentDateSummary groups={[]} />
          <DashboardEmptyState />
          <RefreshPanel lastUpdatedAt={null} now={NOW} />
        </div>

        <div className="space-y-4">
          <p className="px-1 text-xs font-semibold tracking-wide text-muted">
            カードの各状態
          </p>
          <ul className="space-y-3">
            {SAMPLES.map((sample) => (
              <li key={sample.label}>
                <p className="mb-1 px-1 text-[11px] text-muted">{sample.label}</p>
                <ul>
                  <CardBillingItem card={sample.card} now={NOW} />
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
