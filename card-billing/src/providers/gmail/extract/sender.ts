/**
 * 送信元（From ヘッダー）の検証。
 *
 * - 表示名は無視し、`<...>` の中のアドレスだけを見る
 * - 小文字にそろえて、正式な送信元アドレスと **完全一致** したときだけ通す
 * - ドメインの部分一致・末尾一致は使わない（似たドメインを通さないため）
 * - `<...>` が 2 つ以上ある From は不正として通さない
 */

const ADDRESS_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/** From ヘッダーから正規化済みのアドレスを 1 つ取り出す。取り出せなければ null。 */
export function extractSenderAddress(from: string | null | undefined): string | null {
  if (!from) return null;
  const angles = from.match(/<[^<>]*>/g) ?? [];
  if (angles.length > 1) return null;
  const raw = angles.length === 1 ? angles[0].slice(1, -1) : from;
  const address = raw.trim().replace(/^mailto:/i, "").toLowerCase();
  return ADDRESS_RE.test(address) ? address : null;
}

export type SenderCheck =
  | { ok: true; address: string }
  | { ok: false; address: string | null };

export function verifySender(
  from: string | null | undefined,
  allowlist: readonly string[],
): SenderCheck {
  const address = extractSenderAddress(from);
  if (!address) return { ok: false, address: null };
  const allowed = allowlist.some((a) => a.toLowerCase() === address);
  return allowed ? { ok: true, address } : { ok: false, address };
}
