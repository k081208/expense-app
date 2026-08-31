import "server-only";

import { listEnabledCards } from "@/lib/cards/queries";
import type { CardBillingSummary } from "@/types/billing";

/**
 * ダッシュボードに渡すデータの取得口。
 *
 * UI コンポーネントから Supabase を直接呼ばないようにするための境界。
 * 画面側は「渡されたデータを表示する」だけの責務に留め、取得元は
 * ここを差し替えるだけで変えられるようにしている。
 *
 * 現在は登録済みカード（有効なもの）だけを読む。請求情報（billing_records）は
 * まだ扱わないため、金額・支払日は空のまま返す。
 * 請求情報の読み出しは STEP 6 以降でここへ足す。
 */
export async function getDashboardCards(): Promise<CardBillingSummary[]> {
  const cards = await listEnabledCards();

  return cards.map((card) => ({
    cardId: card.id,
    provider: card.provider_key,
    displayName: card.display_name,
    lastFour: card.last_four,
    // 登録時に設定した「毎月○日」。正式な支払日ではない。
    paymentDay: card.payment_day,

    // ここから下は請求情報が無い状態を表す。
    // 金額に 0 を入れてはいけない（0 は「請求額 0 円」という確定値になるため）。
    amount: null,
    paymentDate: null,
    source: null,
    fetchedAt: null,
    status: "unknown",
    isProvisional: false,
    errorCode: null,

    // STEP 6: billing_records から本人の行を読み、取得元の優先順位
    //         （api > gmail）を適用して 1 カード 1 件に畳んでから上書きする。
  }));
}
