/**
 * ログイン後の遷移先の検証。
 *
 * `?next=` のような値をそのままリダイレクト先に使うと、外部サイトへ誘導される
 * オープンリダイレクトの脆弱性になる。ここで「同一サイト内の相対パス」だけを
 * 許可し、それ以外はすべてトップへ丸める。
 */

/** 既定の遷移先。 */
export const DEFAULT_REDIRECT = "/";

/** 制御文字（改行・タブ・NUL など）。ヘッダや URL の分解を狙うものを弾く。 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * 受け取った値が安全な内部パスであればそれを返し、そうでなければ "/" を返す。
 *
 * 許可するのは "/" で始まる単一スラッシュのパスのみ。
 * 次のようなものはすべて拒否する:
 *   - "https://example.com"  … 絶対 URL
 *   - "//example.com"        … プロトコル相対 URL
 *   - "/\\example.com"       … ブラウザによっては "//" と解釈されうる
 *   - "javascript:..."       … スキーム付き
 *   - 制御文字を含むもの
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return DEFAULT_REDIRECT;
  if (value.length > 512) return DEFAULT_REDIRECT;
  if (CONTROL_CHARS.test(value)) return DEFAULT_REDIRECT;

  if (!value.startsWith("/")) return DEFAULT_REDIRECT;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_REDIRECT;

  // ログイン関連のページへ戻すとループになるため除外する
  if (
    value === "/login" ||
    value.startsWith("/login?") ||
    value.startsWith("/auth/")
  ) {
    return DEFAULT_REDIRECT;
  }

  return value;
}
