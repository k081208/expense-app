/**
 * Gmail API（messages.get format=full）の payload から本文テキストを取り出す。
 *
 * - multipart は再帰的にたどる。添付（filename あり／attachmentId のみ）は読まない
 * - body.data は base64url。まず UTF-8 として復号し、文字化けの兆候があるときだけ
 *   Content-Type の charset（ISO-2022-JP / Shift_JIS / EUC-JP）で復号し直す
 * - text/plain を優先し、無いときだけ text/html を **文字列処理で** プレーンテキストにする。
 *   HTML は描画も実行もしない（dangerouslySetInnerHTML は使わない）
 * - 取り出したテキストは呼び出し側で解析にだけ使い、保存もログ出力もしない
 */

export type GmailPayloadPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name?: string; value?: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPayloadPart[];
};

export type ExtractedBody =
  | { status: "ok"; text: string; kind: "text/plain" | "text/html" }
  | { status: "missing" }
  | { status: "decode_failed" };

const KNOWN_CHARSETS: Record<string, string> = {
  "iso-2022-jp": "iso-2022-jp",
  shift_jis: "shift_jis",
  "shift-jis": "shift_jis",
  sjis: "shift_jis",
  "windows-31j": "shift_jis",
  cp932: "shift_jis",
  "euc-jp": "euc-jp",
  "utf-8": "utf-8",
  utf8: "utf-8",
  "us-ascii": "utf-8",
};

const REPLACEMENT_CHAR = "�";

function charsetOf(part: GmailPayloadPart): string | null {
  const ct = part.headers?.find((h) => (h.name ?? "").toLowerCase() === "content-type")?.value;
  if (!ct) return null;
  const m = /charset\s*=\s*"?([^";\s]+)"?/i.exec(ct);
  if (!m) return null;
  return KNOWN_CHARSETS[m[1].toLowerCase()] ?? null;
}

function base64UrlToBytes(data: string): Uint8Array | null {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return new Uint8Array(Buffer.from(padded, "base64"));
  } catch {
    return null;
  }
}

function decodeWith(bytes: Uint8Array, charset: string): string | null {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** 復号結果が文字化けしていそうか（置換文字の割合・ISO-2022-JP のエスケープの残り）。 */
export function looksGarbled(text: string): boolean {
  if (!text) return false;
  if (/\$[@B]/.test(text)) return true;
  let replacement = 0;
  for (const ch of text) if (ch === REPLACEMENT_CHAR) replacement += 1;
  return replacement > 0 && replacement / text.length > 0.02;
}

/** base64url の本文を文字列にする。復号できない・文字化けなら null。 */
export function decodeBodyData(data: string, charset: string | null): string | null {
  const bytes = base64UrlToBytes(data);
  if (!bytes) return null;
  const utf8 = decodeWith(bytes, "utf-8");
  if (utf8 !== null && !looksGarbled(utf8)) return utf8;
  if (charset && charset !== "utf-8") {
    const alt = decodeWith(bytes, charset);
    if (alt !== null && !looksGarbled(alt)) return alt;
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  yen: "¥",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  hellip: "…",
  middot: "・",
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * HTML をプレーンテキストにする（文字列処理のみ）。
 * script / style / head / コメントは中身ごと捨てる。ブロック要素の終わりを改行、
 * セルの区切りを空白にして、ラベルと値が同じ行に並ぶようにする。
 */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|head|title|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(
    /<\/\s*(p|div|tr|li|h[1-6]|table|ul|ol|section|article|header|footer|blockquote|pre)\s*>/gi,
    "\n",
  );
  s = s.replace(
    /<\s*(p|div|tr|li|h[1-6]|table|ul|ol|section|article|header|footer|blockquote|pre|hr)\b[^>]*>/gi,
    "\n",
  );
  s = s.replace(/<\/\s*(td|th)\s*>/gi, " ");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeHtmlEntities(s);
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t 　]+/g, " ").trim())
    .join("\n")
    // HTML の改行は見た目の都合なので、空行は残さない（ラベルと値の行を近づける）
    .replace(/\n{2,}/g, "\n")
    .trim();
}

type Collected = { plain: string[]; html: string[]; decodeFailures: number };

function walk(part: GmailPayloadPart | null | undefined, out: Collected, depth = 0): void {
  if (!part || depth > 10) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  const isAttachment =
    Boolean(part.filename) || (Boolean(part.body?.attachmentId) && !part.body?.data);
  if (!isAttachment && part.body?.data && (mime === "text/plain" || mime === "text/html")) {
    const text = decodeBodyData(part.body.data, charsetOf(part));
    if (text === null) out.decodeFailures += 1;
    else if (mime === "text/plain") out.plain.push(text);
    else out.html.push(text);
  }
  for (const child of part.parts ?? []) walk(child, out, depth + 1);
}

export function extractBodyText(payload: GmailPayloadPart | null | undefined): ExtractedBody {
  const out: Collected = { plain: [], html: [], decodeFailures: 0 };
  walk(payload, out);

  const plain = out.plain.join("\n").trim();
  const html = out.html.length > 0 ? htmlToText(out.html.join("\n")).trim() : "";

  // text/plain が実質空（「HTML 版をご覧ください」の一言など）なら HTML を使う
  if (plain.length >= 20 || (plain.length > 0 && html.length === 0)) {
    return { status: "ok", text: plain, kind: "text/plain" };
  }
  if (html.length > 0) return { status: "ok", text: html, kind: "text/html" };
  if (plain.length > 0) return { status: "ok", text: plain, kind: "text/plain" };
  if (out.decodeFailures > 0) return { status: "decode_failed" };
  return { status: "missing" };
}
