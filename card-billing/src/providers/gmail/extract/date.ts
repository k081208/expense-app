import { findLabelHits } from "./lines";
import { clip, maskDigits, normalizeSubject } from "./text";

/**
 * 支払日の抽出。
 *
 * - ラベル（お支払い日 / お振替日 など）の直後の日付だけを候補にする
 * - 「2026年9月27日」「2026/9/27」は年付き、「9月27日」は受信日時から年を補う
 * - 補完は純粋関数（inferYear）。支払日はメールの少し後に来るという前提で、
 *   受信日から 45 日前〜400 日後に収まる年を選ぶ
 * - 2 月 30 日などの不正な日付は失敗にする。カードの payment_day から日付を作ることはしない
 */

const FULL_DATE_RE = /(\d{4})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?/;
const MONTH_DAY_RE = /(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

export const YEAR_INFERENCE_MIN_DAYS = -45;
export const YEAR_INFERENCE_MAX_DAYS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

export function toYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 年の無い「9月27日」に年を補う。受信日時（UTC の瞬間）を基準に、
 * 受信日から YEAR_INFERENCE_MIN_DAYS〜MAX_DAYS に入る年のうち最も近いものを返す。
 * 該当が無ければ受信年。
 */
export function inferYear(month: number, day: number, receivedAt: Date): number {
  const jst = new Date(receivedAt.getTime() + 9 * 60 * 60 * 1000);
  const receivedYear = jst.getUTCFullYear();
  const receivedDay = Date.UTC(receivedYear, jst.getUTCMonth(), jst.getUTCDate());
  let best: { year: number; distance: number } | null = null;
  for (const year of [receivedYear - 1, receivedYear, receivedYear + 1]) {
    if (!isValidYmd(year, month, day)) continue;
    const diff = Math.round((Date.UTC(year, month - 1, day) - receivedDay) / DAY_MS);
    if (diff < YEAR_INFERENCE_MIN_DAYS || diff > YEAR_INFERENCE_MAX_DAYS) continue;
    const distance = Math.abs(diff);
    if (!best || distance < best.distance) best = { year, distance };
  }
  return best ? best.year : receivedYear;
}

export type DateParse =
  | { status: "ok"; date: string }
  | { status: "invalid" }
  | { status: "none" };

/** 文字列の中の最初の日付を "YYYY-MM-DD" にする。 */
export function firstDateIn(segment: string, receivedAt: Date): DateParse {
  const full = FULL_DATE_RE.exec(segment);
  const md = MONTH_DAY_RE.exec(segment);
  // 年付きと年無しの両方があるときは、先に現れる方を使う
  if (full && (!md || full.index <= md.index)) {
    const [y, m, d] = [Number(full[1]), Number(full[2]), Number(full[3])];
    return isValidYmd(y, m, d) ? { status: "ok", date: toYmd(y, m, d) } : { status: "invalid" };
  }
  if (md) {
    const [m, d] = [Number(md[1]), Number(md[2])];
    if (m < 1 || m > 12 || d < 1 || d > 31) return { status: "invalid" };
    const y = inferYear(m, d, receivedAt);
    return isValidYmd(y, m, d) ? { status: "ok", date: toYmd(y, m, d) } : { status: "invalid" };
  }
  return { status: "none" };
}

export type DateCandidate = { labelIndex: number; line: number; date: string };

export type DateExtraction = {
  paymentDate: string | null;
  status: "ok" | "none" | "invalid" | "ambiguous";
  candidates: DateCandidate[];
  /** どこから取れたか */
  from: "body" | "subject" | null;
  notes: string[];
};

export function extractPaymentDate(
  text: string,
  options: {
    labels: readonly RegExp[];
    exclude?: readonly RegExp[];
    receivedAt: Date;
    /** 本文で見つからないときに日付を探す件名（規則で許可された場合だけ渡す） */
    subjectFallback?: string | null;
  },
): DateExtraction {
  const lines = text.split("\n");
  const hits = findLabelHits(lines, options.labels, options.exclude ?? []);
  const candidates: DateCandidate[] = [];
  const notes: string[] = [];
  let sawInvalid = false;

  for (const hit of hits) {
    const parsed = firstDateIn(hit.segment, options.receivedAt);
    if (parsed.status === "ok") {
      candidates.push({ labelIndex: hit.labelIndex, line: hit.line, date: parsed.date });
    } else if (parsed.status === "invalid") {
      sawInvalid = true;
      notes.push(`日付ラベル${hit.labelIndex + 1} 行${hit.line + 1}: 不正な日付「${clip(maskDigits(hit.sourceLine))}」`);
    } else {
      notes.push(`日付ラベル${hit.labelIndex + 1} 行${hit.line + 1}: 日付なし「${clip(maskDigits(hit.sourceLine))}」`);
    }
  }

  if (candidates.length > 0) {
    const best = Math.min(...candidates.map((c) => c.labelIndex));
    const values = [...new Set(candidates.filter((c) => c.labelIndex === best).map((c) => c.date))];
    if (values.length === 1) {
      return { paymentDate: values[0], status: "ok", candidates, from: "body", notes };
    }
    notes.push(`日付ラベル${best + 1} に異なる日付が ${values.length} 種類あります`);
    return { paymentDate: null, status: "ambiguous", candidates, from: null, notes };
  }

  if (sawInvalid) return { paymentDate: null, status: "invalid", candidates, from: null, notes };

  if (options.subjectFallback) {
    const parsed = firstDateIn(normalizeSubject(options.subjectFallback), options.receivedAt);
    if (parsed.status === "ok") {
      notes.push("支払日は件名から取得");
      return { paymentDate: parsed.date, status: "ok", candidates, from: "subject", notes };
    }
    if (parsed.status === "invalid") {
      return { paymentDate: null, status: "invalid", candidates, from: null, notes };
    }
  }

  if (hits.length === 0) notes.push("支払日ラベルに当たる行がありません");
  return { paymentDate: null, status: "none", candidates, from: null, notes };
}
