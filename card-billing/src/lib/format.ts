/** 金額・日付の表示フォーマット。UI 全体でここだけを使う。 */

const YEN = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

/** 金額を「¥82,400」の形式にする。null は「—」。 */
export function formatYen(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return YEN.format(amount);
}

/**
 * "YYYY-MM-DD" を「9月27日」にする。
 * 想定外の形式が来ても「NaN」などを画面に出さず「支払日未定」に倒す。
 */
export function formatPaymentDate(date: string | null | undefined): string {
  if (!date) return "支払日未定";
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!matched) return "支払日未定";
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "支払日未定";
  return `${month}月${day}日`;
}

/**
 * 最終更新日時を「本日 21:42」「昨日 09:05」「8月28日 21:42」の形式にする。
 * @param now テスト用に基準時刻を差し替えるための引数。
 */
export function formatLastUpdated(
  isoDate: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!isoDate) return "未更新";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "未更新";

  const time = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(d);

  const dayKey = (x: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(x);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  if (dayKey(d) === dayKey(now)) return `本日 ${time}`;
  if (dayKey(d) === dayKey(yesterday)) return `昨日 ${time}`;

  const md = new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(d);
  return `${md} ${time}`;
}

/** 下 4 桁の表示。未登録なら空文字。 */
export function formatLastFour(lastFour: string | null | undefined): string {
  return lastFour ? `•••• ${lastFour}` : "";
}
