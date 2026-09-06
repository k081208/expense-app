/**
 * 本文・件名の前処理。
 *
 * 全角の数字・記号・英字を半角にそろえ、行ごとに余分な空白を取り除く。
 * NFKC 正規化は括弧や「〜」まで変えてしまうため使わず、必要な文字だけを対象にする。
 * 意味のある改行（行の区切り）は残す。ラベルと金額の対応付けは行単位で行うため。
 */
export function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ 　\t]/g, " ")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ",")
    .replace(/．/g, ".")
    .replace(/／/g, "/")
    .replace(/[－―‐−]/g, "-")
    .replace(/￥/g, "¥")
    .replace(/：/g, ":")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/【/g, "[")
    .replace(/】/g, "]")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** 件名は 1 行に畳む。 */
export function normalizeSubject(value: string | null | undefined): string {
  if (!value) return "";
  return normalizeText(value).replace(/\n+/g, " ").trim();
}

/** 数字を `#` に置き換える（開発画面の抽出過程に行の形だけを出すため）。 */
export function maskDigits(value: string): string {
  return value.replace(/\d/g, "#");
}

/** 開発画面に出す 1 行を短く切る。 */
export function clip(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
