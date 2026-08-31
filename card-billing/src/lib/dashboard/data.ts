import "server-only";

import type { CardBillingSummary } from "@/types/billing";

/**
 * ダッシュボードに渡すデータの取得口。
 *
 * UI コンポーネントから Supabase を直接呼ばないようにするための境界。
 * 画面側は「渡されたデータを表示する」だけの責務に留め、取得元は
 * ここを差し替えるだけで変えられるようにしている。
 *
 * STEP 4 の時点ではカード登録機能（STEP 5）も請求データの取得（STEP 6 以降）も
 * まだ無いため、常に空を返す。実データの読み出しはここに実装する。
 */
export async function getDashboardCards(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId: string,
): Promise<CardBillingSummary[]> {
  // STEP 6: cards と billing_records から本人の行を読み、
  //         取得元の優先順位（api > gmail）を適用して 1 カード 1 件に畳む。
  return [];
}
