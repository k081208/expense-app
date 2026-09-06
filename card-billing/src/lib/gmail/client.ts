import "server-only";

import { logger } from "@/lib/logger";
import { getValidGoogleAccessToken, shortConnectionRef } from "./tokens";

/**
 * Gmail API クライアント（STEP 8 以降で共通に使う層）。
 *
 * - アクセストークンは必ず `getValidGoogleAccessToken()` から得る。
 *   別のトークン取得経路は作らない（期限切れの自動更新もそこに集約されている）。
 * - Gmail 側の userId は常に `me`。どのアカウントかは連携（connection）が決める。
 * - ここでは本文を扱う関数を用意しない。STEP 8A で必要なのは
 *   一覧（messages.list）とヘッダーだけの取得（messages.get format=metadata）のみ。
 * - Google のエラー本文は利用者へ見せない。分類（category）と HTTP status だけを扱う。
 */

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** 1 リクエストの上限時間。Gmail は通常 1〜2 秒で応答する。 */
export const GMAIL_REQUEST_TIMEOUT_MS = 15_000;

/** messages.list で 1 回に受け取る件数の上限（Gmail API の上限は 500）。 */
export const GMAIL_MAX_RESULTS_LIMIT = 500;

export type GmailErrorCategory =
  /** 認証切れ。トークンが無効。再連携が必要な可能性 */
  | "unauthorized"
  /** 権限不足。スコープ不足や API 無効化など */
  | "forbidden"
  /** 呼び出し回数の制限。時間をおけば回復する */
  | "rate_limited"
  /** Google 側の障害（5xx） */
  | "server_error"
  /** 応答が返らなかった */
  | "timeout"
  /** 接続できなかった */
  | "network"
  /** 対象が存在しない（削除済みメールなど） */
  | "not_found"
  /** こちらの要求が不正（クエリの誤りなど） */
  | "bad_request"
  /** 連携が無い・失効している（トークンを得られない） */
  | "not_connected"
  | "unknown";

export class GmailApiError extends Error {
  readonly category: GmailErrorCategory;
  readonly status: number | null;
  /** 将来の再試行で回復が見込めるか。今回は再試行しない（設計上の印だけ）。 */
  readonly retryable: boolean;

  constructor(category: GmailErrorCategory, status: number | null = null) {
    super(`gmail_api_${category}`);
    this.name = "GmailApiError";
    this.category = category;
    this.status = status;
    this.retryable =
      category === "rate_limited" ||
      category === "server_error" ||
      category === "timeout" ||
      category === "network";
  }
}

/** HTTP status と Google のエラー理由から分類を決める。本文は持ち回らない。 */
export function categorizeGmailStatus(status: number, reason?: string | null): GmailErrorCategory {
  if (status === 401) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 403) {
    // Gmail は利用者ごとのレート制限を 403 で返すことがある
    return reason && /ratelimit|quota/i.test(reason) ? "rate_limited" : "forbidden";
  }
  if (status === 404) return "not_found";
  if (status === 400) return "bad_request";
  if (status >= 500) return "server_error";
  return "unknown";
}

export type GmailMessageRef = { id: string; threadId: string };

export type GmailListResult = {
  messages: GmailMessageRef[];
  nextPageToken: string | null;
  /** Gmail が推定した該当件数。正確な値ではない。 */
  resultSizeEstimate: number;
  /** この呼び出しの途中でアクセストークンの自動更新が起きたか。 */
  tokenRefreshed: boolean;
};

export type GmailMessageMetadata = {
  id: string;
  threadId: string;
  /** Gmail 内部の受信時刻（ミリ秒のエポック）。無ければ null。 */
  internalDate: string | null;
  labelIds: string[];
  /** 要求したヘッダーだけ。キーは小文字（from / subject / date / message-id）。 */
  headers: Record<string, string>;
  tokenRefreshed: boolean;
};

/** STEP 8A で取得するヘッダー。To / Cc / Bcc は取らない。 */
export const DEFAULT_METADATA_HEADERS = ["From", "Subject", "Date", "Message-ID"] as const;

type FetchParams = {
  /** 認証済みアプリユーザーの id。ブラウザから来た値は使わない。 */
  userId: string;
  connectionId: string;
  /** `/messages` のように GMAIL_API_BASE からの相対パス */
  path: string;
  searchParams: URLSearchParams;
  timeoutMs?: number;
};

/**
 * Gmail API を 1 回呼ぶ。
 * 再試行はしない（無限再試行を絶対に起こさないため）。呼び出し側が
 * `GmailApiError.retryable` を見て将来判断できるようにしてある。
 */
async function gmailFetch(params: FetchParams): Promise<{ json: unknown; tokenRefreshed: boolean }> {
  const token = await getValidGoogleAccessToken({
    userId: params.userId,
    connectionId: params.connectionId,
  });
  if (!token.ok) {
    throw new GmailApiError(token.code === "upstream_error" ? "server_error" : "not_connected");
  }

  const url = `${GMAIL_API_BASE}${params.path}?${params.searchParams.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? GMAIL_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token.accessToken}`, accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    const category: GmailErrorCategory =
      e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
    logger.warn("Gmail API に到達できませんでした", {
      connection: shortConnectionRef(params.connectionId),
      path: params.path,
      category,
    });
    throw new GmailApiError(category);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 理由コードだけを読む。メッセージ本文は記録も表示もしない。
    let reason: string | null = null;
    try {
      const body = (await response.json()) as {
        error?: { errors?: { reason?: string }[]; status?: string };
      };
      reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? null;
    } catch {
      reason = null;
    }
    const category = categorizeGmailStatus(response.status, reason);
    logger.warn("Gmail API がエラーを返しました", {
      connection: shortConnectionRef(params.connectionId),
      path: params.path,
      status: response.status,
      category,
    });
    throw new GmailApiError(category, response.status);
  }

  return { json: await response.json(), tokenRefreshed: token.refreshed };
}

/**
 * users.messages.list
 *
 * 検索は必ず Gmail 側の `q` で絞る。全件を取ってアプリ側で選別することはしない。
 * 迷惑メール・ゴミ箱は既定で対象外。
 */
export async function listGmailMessages(params: {
  userId: string;
  connectionId: string;
  query: string;
  maxResults?: number;
  pageToken?: string | null;
  includeSpamTrash?: boolean;
}): Promise<GmailListResult> {
  const maxResults = Math.min(
    Math.max(1, Math.floor(params.maxResults ?? 50)),
    GMAIL_MAX_RESULTS_LIMIT,
  );

  const searchParams = new URLSearchParams({
    q: params.query,
    maxResults: String(maxResults),
    includeSpamTrash: params.includeSpamTrash ? "true" : "false",
  });
  if (params.pageToken) searchParams.set("pageToken", params.pageToken);

  const { json, tokenRefreshed } = await gmailFetch({
    userId: params.userId,
    connectionId: params.connectionId,
    path: "/messages",
    searchParams,
  });

  const body = (json ?? {}) as {
    messages?: { id?: string; threadId?: string }[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  };

  return {
    messages: (body.messages ?? [])
      .filter((m): m is { id: string; threadId: string } => !!m.id && !!m.threadId)
      .map((m) => ({ id: m.id, threadId: m.threadId })),
    nextPageToken: body.nextPageToken ?? null,
    resultSizeEstimate: body.resultSizeEstimate ?? 0,
    tokenRefreshed,
  };
}

/**
 * users.messages.get（format=metadata）
 *
 * 本文は取得しない。Gmail は metadata でも snippet を返してくるが、
 * 金額や個人情報を含みうるため **ここで捨てる**。呼び出し側には渡らない。
 */
export async function getGmailMessageMetadata(params: {
  userId: string;
  connectionId: string;
  messageId: string;
  headers?: readonly string[];
}): Promise<GmailMessageMetadata> {
  const wanted = params.headers ?? DEFAULT_METADATA_HEADERS;

  const searchParams = new URLSearchParams({ format: "metadata" });
  for (const name of wanted) searchParams.append("metadataHeaders", name);

  const { json, tokenRefreshed } = await gmailFetch({
    userId: params.userId,
    connectionId: params.connectionId,
    path: `/messages/${encodeURIComponent(params.messageId)}`,
    searchParams,
  });

  const body = (json ?? {}) as {
    id?: string;
    threadId?: string;
    internalDate?: string;
    labelIds?: string[];
    payload?: { headers?: { name?: string; value?: string }[] };
  };

  // 要求したヘッダーだけを残す（Gmail が余分に返しても捨てる）
  const allowed = new Set(wanted.map((h) => h.toLowerCase()));
  const headers: Record<string, string> = {};
  for (const h of body.payload?.headers ?? []) {
    const key = (h.name ?? "").toLowerCase();
    if (allowed.has(key) && typeof h.value === "string" && !(key in headers)) {
      headers[key] = h.value;
    }
  }

  return {
    id: body.id ?? params.messageId,
    threadId: body.threadId ?? "",
    internalDate: body.internalDate ?? null,
    labelIds: body.labelIds ?? [],
    headers,
    tokenRefreshed,
  };
}
