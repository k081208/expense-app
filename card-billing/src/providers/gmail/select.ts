import type { GmailMailClass, ParsedGmailBilling } from "./types";

/**
 * 同じカードについて複数のメールが解析できたとき、どれを「次回の請求」として
 * 採用するかを決める（STEP 8B では画面表示のみ。保存は STEP 10）。
 *
 * 1. 成功した結果だけを対象にする
 * 2. 支払日が基準日以降のものがあれば、その中で最も近い支払日
 *    （無ければ最も新しい支払日。支払日不明は最後）
 * 3. 同じ支払日なら 変更 > 確定 > 予定 > 引き落とし案内
 * 4. それでも同じなら受信日時が新しい方（JCB の「変更」は「確定」より後に届く）
 */
const CLASS_RANK: Record<GmailMailClass, number> = {
  changed: 4,
  confirmed: 3,
  provisional: 2,
  payment_notice: 1,
  irrelevant: 0,
};

export function selectCurrentBilling(
  records: readonly ParsedGmailBilling[],
  asOf: Date,
): ParsedGmailBilling | null {
  const ok = records.filter((r) => r.status === "success" && r.cardId);
  if (ok.length === 0) return null;
  const today = asOf.toISOString().slice(0, 10);

  const upcoming = ok.filter((r) => r.paymentDate && r.paymentDate >= today);
  const pool = upcoming.length > 0 ? upcoming : ok;

  return [...pool].sort((a, b) => {
    if (a.paymentDate !== b.paymentDate) {
      if (!a.paymentDate) return 1;
      if (!b.paymentDate) return -1;
      // 未来があれば近い順、無ければ新しい順
      return upcoming.length > 0
        ? a.paymentDate.localeCompare(b.paymentDate)
        : b.paymentDate.localeCompare(a.paymentDate);
    }
    const rank = CLASS_RANK[b.mailClass] - CLASS_RANK[a.mailClass];
    if (rank !== 0) return rank;
    return b.sourceReceivedAt.localeCompare(a.sourceReceivedAt);
  })[0];
}

/** カードごとに採用結果を決める。 */
export function selectCurrentBillingByCard(
  records: readonly ParsedGmailBilling[],
  asOf: Date,
): Map<string, ParsedGmailBilling> {
  const byCard = new Map<string, ParsedGmailBilling[]>();
  for (const r of records) {
    if (r.status !== "success" || !r.cardId) continue;
    const list = byCard.get(r.cardId) ?? [];
    list.push(r);
    byCard.set(r.cardId, list);
  }
  const out = new Map<string, ParsedGmailBilling>();
  for (const [cardId, list] of byCard) {
    const chosen = selectCurrentBilling(list, asOf);
    if (chosen) out.set(cardId, chosen);
  }
  return out;
}
