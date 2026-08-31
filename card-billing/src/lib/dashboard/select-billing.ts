import { SOURCE_PRIORITY } from "@/types/billing";
import type { BillingRecordRow } from "@/types/database";

/**
 * 1 枚のカードについて「次回の請求」として表示するレコードを選ぶ。
 *
 * ここは純粋関数だけ。DB にも Supabase にも触れないので、そのままテストできる。
 *
 * 【選定ルール】
 *   1. 支払日が今日以降のレコードのうち、いちばん近い支払日を「次回」とする。
 *      過去の支払日はもう引き落とし済みなので、次回支払予定には採用しない。
 *   2. その支払日に複数のレコードがある場合は、取得元の優先順位（api > gmail）で選ぶ。
 *      優先順位は STEP 1 の `SOURCE_PRIORITY` をそのまま使い、ここで再定義しない。
 *   3. 取得元も同じなら、取得日時（fetched_at）が新しいものを採用する。
 *   4. 今日以降の支払日が 1 件も無い場合は、支払日が分からない（null）レコードを
 *      採用する。これは「取得に失敗して支払日も分からない」状態を画面に出すため。
 *   5. それも無ければ何も採用しない（過去の請求を次回支払予定として出さない）。
 *
 * `created_at` が新しいという理由だけでは選ばない。あくまで支払日が基準で、
 * 同じ支払日の中でだけ取得元と取得日時を見る。
 */

/** 今日（日本時間）の日付を "YYYY-MM-DD" で返す。 */
export function todayInJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 同じ支払日の中での優先度比較。大きいほうを採用する。 */
function isBetter(candidate: BillingRecordRow, current: BillingRecordRow): boolean {
  const candidatePriority = SOURCE_PRIORITY[candidate.source];
  const currentPriority = SOURCE_PRIORITY[current.source];
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority;
  }
  return candidate.fetched_at > current.fetched_at;
}

/**
 * 次回請求として採用するレコードを返す。該当が無ければ null。
 * @param records そのカードの請求レコード（順不同）
 * @param today   "YYYY-MM-DD"。テストで固定できるよう外から渡す。
 */
export function selectNextBilling(
  records: BillingRecordRow[],
  today: string,
): BillingRecordRow | null {
  // 1. 今日以降でいちばん近い支払日を探す
  let nextDate: string | null = null;
  for (const record of records) {
    if (!record.payment_date || record.payment_date < today) continue;
    if (nextDate === null || record.payment_date < nextDate) {
      nextDate = record.payment_date;
    }
  }

  // 2-3. その支払日の中から優先順位で選ぶ。
  //      無ければ 4. 支払日が分からないレコードから選ぶ。
  const candidates = records.filter((record) =>
    nextDate !== null ? record.payment_date === nextDate : record.payment_date === null,
  );

  let selected: BillingRecordRow | null = null;
  for (const record of candidates) {
    if (selected === null || isBetter(record, selected)) selected = record;
  }

  return selected;
}
