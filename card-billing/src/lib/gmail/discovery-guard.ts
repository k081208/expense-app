/**
 * 探索（Discovery）機能を使えるかどうかの判定。
 *
 * 開発時の調査専用で、本番では絶対に使えないようにする。
 *   - NODE_ENV が production なら不可
 *   - さらに ENABLE_GMAIL_DISCOVERY=1 を明示していなければ不可
 *
 * 画面（page）と Server Action の両方でこの関数を通す。
 * URL を直接叩いても、Action を直接呼んでも、同じ判定になる。
 */
export function isGmailDiscoveryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.ENABLE_GMAIL_DISCOVERY === "1";
}
