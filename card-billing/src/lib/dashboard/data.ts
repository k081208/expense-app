import "server-only";

import { listEnabledCards } from "@/lib/cards/queries";
import { createClient } from "@/lib/supabase/server";
import { selectNextBilling, todayInJst } from "@/lib/dashboard/select-billing";
import type { CardBillingSummary } from "@/types/billing";
import type { BillingRecordRow } from "@/types/database";

/**
 * ダッシュボードに渡すデータの取得口。
 *
 * UI コンポーネントから Supabase を直接呼ばないようにするための境界。
 * 画面側は「渡されたデータを表示する」だけの責務に留めている。
 *
 * 問い合わせは 2 回だけ（カード一覧 → その全カード分の請求情報）。
 * カードの枚数ぶん問い合わせる作りにはしていない。
 */

/** 請求情報をカード ID ごとにまとめる。 */
function groupByCard(records: BillingRecordRow[]): Map<string, BillingRecordRow[]> {
  const byCard = new Map<string, BillingRecordRow[]>();
  for (const record of records) {
    const list = byCard.get(record.card_id);
    if (list) list.push(record);
    else byCard.set(record.card_id, [record]);
  }
  return byCard;
}

export async function getDashboardCards(
  /** 「次回」の判定に使う今日の日付。テストで固定できるよう外から渡せる。 */
  today: string = todayInJst(),
): Promise<CardBillingSummary[]> {
  const cards = await listEnabledCards();
  if (cards.length === 0) return [];

  // 全カード分の請求情報を 1 回でまとめて取得する。
  // RLS により本人の行しか返らない。
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_records")
    .select("*")
    .in(
      "card_id",
      cards.map((card) => card.id),
    );

  // 請求情報が読めなくてもカード一覧は出せるようにする（画面全体を落とさない）
  const byCard = groupByCard(error ? [] : (data ?? []));

  return cards.map((card) => {
    const billing = selectNextBilling(byCard.get(card.id) ?? [], today);

    return {
      cardId: card.id,
      provider: card.provider_key,
      displayName: card.display_name,
      lastFour: card.last_four,
      // 登録時に設定した「毎月○日」。正式な支払日ではない。
      paymentDay: card.payment_day,

      // 請求情報がまだ無いカードは未取得のまま返す。
      // 金額に 0 を入れてはいけない（0 は「請求額 0 円」という確定値になるため）。
      amount: billing?.amount ?? null,
      paymentDate: billing?.payment_date ?? null,
      source: billing?.source ?? null,
      fetchedAt: billing?.fetched_at ?? null,
      status: billing?.status ?? "unknown",
      isProvisional: billing?.is_provisional ?? false,
      errorCode: billing?.error_code ?? null,
    };
  });
}
