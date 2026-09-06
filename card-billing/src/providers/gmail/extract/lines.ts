/**
 * ラベル → 値 の対応付けを行単位で行うための共通処理。
 *
 * 「本文で最初に出てくる円を取る」ことはしない。必ずラベル（ご請求金額 など）を
 * 見つけ、そのラベルの **直後**（同じ行の残り、または値だけが次の行にある場合は次の行）
 * から値を探す。
 */

export type LabelHit = {
  /** 何番目のラベル規則に当たったか（0 が最優先） */
  labelIndex: number;
  /** 行番号（0 始まり） */
  line: number;
  /** ラベルの直後の文字列（値を探す範囲） */
  segment: string;
  /** 値の探索に使った行の全文（開発画面用。数字はマスクして出す） */
  sourceLine: string;
};

/**
 * ラベル規則ごとに当たった行を集める。
 * 同じ行に複数の規則が当たっても、最優先の規則だけを採用する。
 */
export function findLabelHits(
  lines: readonly string[],
  labels: readonly RegExp[],
  exclude: readonly RegExp[],
): LabelHit[] {
  const hits: LabelHit[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (exclude.some((re) => re.test(line))) continue;
    for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      const m = labels[labelIndex].exec(line);
      if (!m) continue;
      let segment = line.slice(m.index + m[0].length);
      let sourceLine = line;
      // 「ご請求金額：」のように値が次の行にあるときだけ、次の空でない行を見る
      if (!/\d/.test(segment) && segment.replace(/[\s:：]/g, "").length <= 4) {
        const next = nextNonEmptyLine(lines, i + 1);
        if (next !== null && !exclude.some((re) => re.test(next.text))) {
          const nextIsLabel = labels.some((re) => re.test(next.text));
          if (!nextIsLabel) {
            segment = next.text;
            sourceLine = next.text;
          }
        }
      }
      hits.push({ labelIndex, line: i, segment, sourceLine });
      break;
    }
  }
  return hits;
}

function nextNonEmptyLine(
  lines: readonly string[],
  start: number,
): { index: number; text: string } | null {
  for (let j = start; j < Math.min(lines.length, start + 3); j += 1) {
    if (lines[j] && lines[j].trim()) return { index: j, text: lines[j] };
  }
  return null;
}
