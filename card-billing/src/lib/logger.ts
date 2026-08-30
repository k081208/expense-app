/**
 * ログ出力。
 *
 * 金融情報を扱うため、ログには機密情報を出さない。
 * - アクセストークン / リフレッシュトークン / メール本文 / メールアドレス
 * - カード番号らしき数字列
 * これらは `redact()` で伏字にしてから出力する。
 */

const SENSITIVE_KEYS = [
  "access_token",
  "refresh_token",
  "accessToken",
  "refreshToken",
  "authorization",
  "password",
  "client_secret",
  "clientSecret",
  "apiKey",
  "api_key",
  "body",
  "snippet",
  "email",
  "cookie",
];

/** メールアドレスと 12 桁以上の数字列（カード番号の疑い）を伏字にする。 */
function redactString(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b(?:\d[ -]?){12,19}\b/g, "[redacted-number]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.includes(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", message: string, fields?: Fields) {
  const line = {
    level,
    message,
    ...(fields ? (redact(fields) as Fields) : {}),
    at: new Date().toISOString(),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};
