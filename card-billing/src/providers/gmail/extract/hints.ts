import { clip, maskDigits } from "./text";

/**
 * 解析に失敗したときに、本文の **構造** だけを開発画面へ出すためのヒント。
 *
 * - 金額らしき行（円 / ¥ を含む）、日付らしき行（年月日 / 月日 を含む）、
 *   カード番号らしき行（下4桁 / 末尾 / **** / カード番号）を集める
 * - 数字はすべて `#` にマスクし、1 行は 60 文字で切る
 * - 件数を絞る（各 8 行まで）。本文全文にはならない
 *
 * 実メールのラベルが想定と違うときに、どのラベルを追加すべきかをこれで判断する。
 */

const MAX_LINES_PER_KIND = 8;

const AMOUNT_LINE = /(?:円|¥)/;
const DATE_LINE = /\d\s*年\s*\d{1,2}\s*月|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\/\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}/;
const CARD_LINE = /下\s*4\s*桁|末尾|\*{2,}|カード番号|会員番号/;

export type StructureHintKind = "amount" | "date" | "card";

export function collectStructureHints(
  text: string,
  kinds: readonly StructureHintKind[],
): string[] {
  const lines = text.split("\n");
  const out: string[] = [];
  const wanted: { kind: StructureHintKind; re: RegExp; label: string }[] = [];
  if (kinds.includes("amount")) wanted.push({ kind: "amount", re: AMOUNT_LINE, label: "金額らしき行" });
  if (kinds.includes("date")) wanted.push({ kind: "date", re: DATE_LINE, label: "日付らしき行" });
  if (kinds.includes("card")) wanted.push({ kind: "card", re: CARD_LINE, label: "カード番号らしき行" });

  for (const w of wanted) {
    let count = 0;
    for (let i = 0; i < lines.length && count < MAX_LINES_PER_KIND; i += 1) {
      const line = lines[i];
      if (!line || !w.re.test(line)) continue;
      out.push(`${w.label} 行${i + 1}: 「${clip(maskDigits(line))}」`);
      count += 1;
    }
    if (count === 0) out.push(`${w.label}: なし`);
  }
  return out;
}
