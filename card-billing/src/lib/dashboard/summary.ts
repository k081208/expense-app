import type {
  CardBillingSummary,
  DashboardSummary,
  PaymentDateTotal,
} from "@/types/billing";

/**
 * ダッシュボードの集計。
 *
 * ここにあるのはすべて純粋関数で、DB にも Supabase にも触れない。
 * 入力（カードの一覧）だけから出力が決まるため、そのままテストできる。
 * データの取得元は STEP 6 以降で差し替える。
 */

/** 支払日ごとのまとまり。内訳のカードも持つ。 */
export type PaymentDateGroup = PaymentDateTotal & {
  cards: CardBillingSummary[];
};

/** 金額が確定して集計対象にできるカードか。 */
function hasAmount(
  card: CardBillingSummary,
): card is CardBillingSummary & { amount: number } {
  return card.status === "success" && typeof card.amount === "number";
}

/**
 * 支払日ごとに合計する。支払日が不明なカードは対象外（金額だけ分かっている
 * 状態では、いつ引き落とされるかを示せないため）。日付の昇順で返す。
 */
export function groupByPaymentDate(
  cards: CardBillingSummary[],
): PaymentDateGroup[] {
  const groups = new Map<string, PaymentDateGroup>();

  for (const card of cards) {
    if (!card.paymentDate || !hasAmount(card)) continue;

    const group = groups.get(card.paymentDate) ?? {
      paymentDate: card.paymentDate,
      total: 0,
      cardCount: 0,
      cards: [],
    };
    group.total += card.amount;
    group.cardCount += 1;
    group.cards.push(card);
    groups.set(card.paymentDate, group);
  }

  return [...groups.values()].sort((a, b) =>
    a.paymentDate.localeCompare(b.paymentDate),
  );
}

/** 次回支払予定の合計。金額が分かっているカードだけを足す。 */
export function totalAmount(cards: CardBillingSummary[]): number {
  return cards.reduce((sum, card) => (hasAmount(card) ? sum + card.amount : sum), 0);
}

/**
 * 全カードのうち、もっとも古い取得日時を返す。
 *
 * 「最終更新」としてもっとも新しい日時を出すと、更新できていないカードが
 * あっても新しく見えてしまう。もっとも古い日時なら「すべてこの時刻以降の
 * 情報」と言えるため、こちらを採用している（STEP 1 の型定義に準拠）。
 */
export function oldestFetchedAt(cards: CardBillingSummary[]): string | null {
  const times = cards
    .map((card) => card.fetchedAt)
    .filter((value): value is string => Boolean(value));

  if (times.length === 0) return null;
  return times.reduce((oldest, value) => (value < oldest ? value : oldest));
}

/** カードの一覧からダッシュボードの表示内容を組み立てる。 */
export function summarizeDashboard(
  cards: CardBillingSummary[],
): DashboardSummary & { byPaymentDate: PaymentDateGroup[] } {
  return {
    total: totalAmount(cards),
    cards,
    byPaymentDate: groupByPaymentDate(cards),
    lastUpdatedAt: oldestFetchedAt(cards),
    hasError: cards.some((card) => card.status === "error"),
  };
}

/** 金額がまだ 1 件も分かっていない状態か（合計を「¥—」にするかの判定）。 */
export function hasAnyAmount(cards: CardBillingSummary[]): boolean {
  return cards.some(hasAmount);
}
