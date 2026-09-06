import { findLabelHits } from "./lines";
import { clip, maskDigits } from "./text";

/**
 * 請求金額の抽出。
 *
 * - ラベル（ご請求金額 など）の直後にある金額だけを候補にする
 * - ポイント・利用可能額などの行は規則の除外語で外す
 * - 最優先のラベルで見つかった候補がすべて同じ値なら採用。値が食い違えば
 *   「決められない」（ambiguous）として失敗にする。間違った金額を出すより安全なため
 * - 0 円は正常な金額として扱う（amount = 0）
 */

/** ¥1,234 / 1,234円 / 1234 円 / 0円 */
const AMOUNT_RE = /(?:¥\s*(\d{1,3}(?:,\d{3})+|\d+)(?!\d)|(?<![\d,])(\d{1,3}(?:,\d{3})+|\d+)\s*円)/g;

export type AmountCandidate = {
  labelIndex: number;
  line: number;
  amount: number;
};

export type AmountExtraction = {
  amount: number | null;
  status: "ok" | "none" | "ambiguous";
  candidates: AmountCandidate[];
  /** 開発画面用（数字をマスクした行の形） */
  notes: string[];
};

/** 文字列の中の最初の金額を返す。 */
export function firstAmountIn(segment: string): number | null {
  AMOUNT_RE.lastIndex = 0;
  const m = AMOUNT_RE.exec(segment);
  if (!m) return null;
  const digits = (m[1] ?? m[2]).replace(/,/g, "");
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

export function extractAmount(
  text: string,
  labels: readonly RegExp[],
  exclude: readonly RegExp[],
): AmountExtraction {
  const lines = text.split("\n");
  const hits = findLabelHits(lines, labels, exclude);
  const candidates: AmountCandidate[] = [];
  const notes: string[] = [];

  for (const hit of hits) {
    const amount = firstAmountIn(hit.segment);
    if (amount === null) {
      notes.push(`金額ラベル${hit.labelIndex + 1} 行${hit.line + 1}: 金額なし「${clip(maskDigits(hit.sourceLine))}」`);
      continue;
    }
    candidates.push({ labelIndex: hit.labelIndex, line: hit.line, amount });
  }

  if (candidates.length === 0) {
    if (hits.length === 0) notes.push("金額ラベルに当たる行がありません");
    return { amount: null, status: "none", candidates, notes };
  }

  const best = Math.min(...candidates.map((c) => c.labelIndex));
  const top = candidates.filter((c) => c.labelIndex === best);
  const values = [...new Set(top.map((c) => c.amount))];
  if (values.length === 1) {
    return { amount: values[0], status: "ok", candidates, notes };
  }
  notes.push(`金額ラベル${best + 1} に異なる値が ${values.length} 種類あります`);
  return { amount: null, status: "ambiguous", candidates, notes };
}
