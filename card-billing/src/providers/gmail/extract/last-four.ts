/**
 * 本文からカード番号の **下 4 桁だけ** を候補として取り出す。
 *
 * - 「下4桁 1234」「末尾1234」「****-****-****-1234」「****1234」の形だけを見る
 * - 16 桁のカード番号そのものを探したり保持したりはしない
 * - 見つかった順に重複なく返す。何も無ければ空配列
 */

const PATTERNS: readonly RegExp[] = [
  /下\s*4\s*桁\s*[)）]?\s*[:：]?\s*[（(]?\s*(?<!\d)(\d{4})(?!\d)/g,
  /末尾\s*[:：]?\s*(?<!\d)(\d{4})(?!\d)/g,
  /(?:[*＊xX×●○]{4}[\s\-‐]?){1,3}(?<!\d)(\d{4})(?!\d)/g,
  /(?:[*＊xX×●○]{2,}|[*＊]+)\s?-?\s?(?<!\d)(\d{4})(?!\d)/g,
];

export function extractLastFourCandidates(text: string): string[] {
  const found: string[] = [];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const digits = m[1];
      if (!found.includes(digits)) found.push(digits);
    }
  }
  return found;
}

/** 開発画面向け。下 4 桁の候補を「末尾 2 桁」だけにして出す。 */
export function describeLastFourCandidates(candidates: readonly string[]): string {
  if (candidates.length === 0) return "本文に下4桁の記載なし";
  return `本文の下4桁候補 ${candidates.length} 件（${candidates.map((c) => `••${c.slice(2)}`).join(", ")}）`;
}
