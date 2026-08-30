import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * OAuth トークンの暗号化・復号。
 *
 * 方式: AES-256-GCM（認証付き暗号）をアプリケーションサーバー上で実行する。
 *
 * - 鍵は環境変数 TOKEN_ENCRYPTION_KEY（base64 の 32 バイト）からのみ読む。
 *   データベースにも Git にも鍵は置かない。
 * - DB (private.oauth_credentials) には暗号文だけを保存する。
 * - 復号はサーバー側のみで行う。ブラウザへ鍵も平文も渡さない。
 *
 * 保存形式:
 *   v<鍵バージョン>.<IV(base64url)>.<認証タグ(base64url)>.<暗号文(base64url)>
 * 先頭に鍵バージョンを持たせることで、後から鍵をローテーションしても
 * 既存データを復号し続けられる。
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM の推奨 IV 長
const KEY_BYTES = 32; // AES-256

/** 現在書き込みに使う鍵バージョン。鍵を変えるときはここを増やす。 */
export const CURRENT_KEY_VERSION = 1;

/** 鍵バージョン → 環境変数名。鍵ローテーション時に旧鍵をここへ追加する。 */
const KEY_ENV_BY_VERSION: Record<number, "TOKEN_ENCRYPTION_KEY"> = {
  1: "TOKEN_ENCRYPTION_KEY",
};

function loadKey(version: number): Buffer {
  const envName = KEY_ENV_BY_VERSION[version];
  if (!envName) {
    throw new Error(`暗号鍵のバージョン ${version} は設定されていません。`);
  }

  // バージョン 1 は必須環境変数として env.ts 側で検証済み。
  const raw = version === 1 ? serverEnv().tokenEncryptionKey : process.env[envName];
  if (!raw) {
    throw new Error(`環境変数 ${envName} が設定されていません。`);
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${envName} は base64 でエンコードした 32 バイトの鍵である必要があります` +
        `（openssl rand -base64 32 で生成できます）。`,
    );
  }
  return key;
}

const b64 = (buf: Buffer) => buf.toString("base64url");
const unb64 = (text: string) => Buffer.from(text, "base64url");

/** 平文のトークンを暗号化する。戻り値をそのまま DB へ保存する。 */
export function encryptToken(
  plaintext: string,
  keyVersion: number = CURRENT_KEY_VERSION,
): string {
  if (!plaintext) {
    throw new Error("空の値は暗号化できません。");
  }
  const key = loadKey(keyVersion);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v${keyVersion}.${b64(iv)}.${b64(tag)}.${b64(ciphertext)}`;
}

/**
 * 暗号文を復号する。
 * 改ざんされていた場合は GCM の認証に失敗して例外になる。
 * 例外メッセージに平文や鍵を含めないこと。
 */
export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(".");
  if (parts.length !== 4 || !parts[0].startsWith("v")) {
    throw new Error("暗号文の形式が正しくありません。");
  }
  const version = Number(parts[0].slice(1));
  if (!Number.isInteger(version)) {
    throw new Error("暗号文の形式が正しくありません。");
  }

  const key = loadKey(version);
  const decipher = createDecipheriv(ALGORITHM, key, unb64(parts[1]));
  decipher.setAuthTag(unb64(parts[2]));
  return Buffer.concat([
    decipher.update(unb64(parts[3])),
    decipher.final(),
  ]).toString("utf8");
}

/** 保存済みの暗号文から鍵バージョンを取り出す。 */
export function keyVersionOf(encrypted: string): number {
  const version = Number(encrypted.split(".")[0]?.slice(1));
  return Number.isInteger(version) ? version : 0;
}

/**
 * 秘密文字列の比較（cron の共有シークレット検証などに使う）。
 * 比較時間を一定にして、当てずっぽうな総当たりの手がかりを与えない。
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
