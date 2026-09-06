import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gmail API クライアントの単体テスト。
 * Google へは接続しない。fetch とトークン取得をモックする。
 */

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const getValidGoogleAccessToken = vi.fn();
vi.mock("../tokens", () => ({
  getValidGoogleAccessToken: (...args: unknown[]) => getValidGoogleAccessToken(...args),
  shortConnectionRef: () => "abcd1234",
}));

import {
  GmailApiError,
  categorizeGmailStatus,
  getGmailMessageMetadata,
  listGmailMessages,
  getGmailMessageFull,
} from "../client";

const USER = "user-1";
const CONN = "conn-1";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getValidGoogleAccessToken.mockResolvedValue({
    ok: true,
    accessToken: "test-access-token",
    refreshed: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function lastRequest(): { url: URL; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch が呼ばれていません");
  return { url: new URL(String(call[0])), init: call[1] ?? {} };
}

describe("listGmailMessages", () => {
  it("messages.list を userId=me で呼び、q と maxResults を渡す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        messages: [
          { id: "m1", threadId: "t1" },
          { id: "m2", threadId: "t2" },
        ],
        resultSizeEstimate: 2,
      }),
    );

    const result = await listGmailMessages({
      userId: USER,
      connectionId: CONN,
      query: "(楽天カード OR 楽天) newer_than:365d",
      maxResults: 50,
    });

    const { url, init } = lastRequest();
    expect(url.origin + url.pathname).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    expect(url.searchParams.get("q")).toBe("(楽天カード OR 楽天) newer_than:365d");
    expect(url.searchParams.get("maxResults")).toBe("50");
    expect(url.searchParams.get("includeSpamTrash")).toBe("false");
    expect(url.searchParams.has("pageToken")).toBe(false);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-access-token");

    expect(result.messages).toEqual([
      { id: "m1", threadId: "t1" },
      { id: "m2", threadId: "t2" },
    ]);
    expect(result.nextPageToken).toBeNull();
    expect(result.resultSizeEstimate).toBe(2);
    expect(result.tokenRefreshed).toBe(false);
  });

  it("getValidGoogleAccessToken を必ず通す（別のトークン取得経路を持たない）", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await listGmailMessages({ userId: USER, connectionId: CONN, query: "x" });
    expect(getValidGoogleAccessToken).toHaveBeenCalledWith({ userId: USER, connectionId: CONN });
  });

  it("ページング: pageToken を送り、nextPageToken を返す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { messages: [{ id: "m3", threadId: "t3" }], nextPageToken: "NEXT" }),
    );
    const result = await listGmailMessages({
      userId: USER,
      connectionId: CONN,
      query: "x",
      pageToken: "PREV",
    });
    expect(lastRequest().url.searchParams.get("pageToken")).toBe("PREV");
    expect(result.nextPageToken).toBe("NEXT");
  });

  it("maxResults は 1〜500 に丸める。既定は 50", async () => {
    // Response は一度しか読めないため、呼び出しごとに新しく作る
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));

    await listGmailMessages({ userId: USER, connectionId: CONN, query: "x" });
    expect(lastRequest().url.searchParams.get("maxResults")).toBe("50");

    await listGmailMessages({ userId: USER, connectionId: CONN, query: "x", maxResults: 99999 });
    expect(lastRequest().url.searchParams.get("maxResults")).toBe("500");

    await listGmailMessages({ userId: USER, connectionId: CONN, query: "x", maxResults: 0 });
    expect(lastRequest().url.searchParams.get("maxResults")).toBe("1");
  });

  it("includeSpamTrash を指定したときだけ true を送る", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await listGmailMessages({ userId: USER, connectionId: CONN, query: "x", includeSpamTrash: true });
    expect(lastRequest().url.searchParams.get("includeSpamTrash")).toBe("true");
  });

  it("トークンの自動更新が起きたことを結果に含める", async () => {
    getValidGoogleAccessToken.mockResolvedValue({ ok: true, accessToken: "t", refreshed: true });
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const result = await listGmailMessages({ userId: USER, connectionId: CONN, query: "x" });
    expect(result.tokenRefreshed).toBe(true);
  });

  it("連携が無い／失効している場合は not_connected", async () => {
    getValidGoogleAccessToken.mockResolvedValue({ ok: false, code: "token_expired" });
    await expect(
      listGmailMessages({ userId: USER, connectionId: CONN, query: "x" }),
    ).rejects.toMatchObject({ category: "not_connected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthorized", false],
    [403, "forbidden", false],
    [429, "rate_limited", true],
    [500, "server_error", true],
    [503, "server_error", true],
  ])("HTTP %s は %s に分類する（本文は持ち回らない）", async (status, category, retryable) => {
    fetchMock.mockResolvedValue(
      jsonResponse(status, { error: { message: "SECRET DETAIL SHOULD NOT LEAK", errors: [] } }),
    );
    const promise = listGmailMessages({ userId: USER, connectionId: CONN, query: "x" });
    await expect(promise).rejects.toBeInstanceOf(GmailApiError);
    await expect(promise).rejects.toMatchObject({ category, status, retryable });
    await expect(promise).rejects.not.toThrow(/SECRET DETAIL/);
  });

  it("403 でも理由が rateLimit なら rate_limited", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { error: { errors: [{ reason: "userRateLimitExceeded" }] } }),
    );
    await expect(
      listGmailMessages({ userId: USER, connectionId: CONN, query: "x" }),
    ).rejects.toMatchObject({ category: "rate_limited", retryable: true });
  });

  it("timeout: 応答が無ければ中断して timeout に分類する（再試行しない）", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const promise = listGmailMessages({ userId: USER, connectionId: CONN, query: "x" });
    const assertion = expect(promise).rejects.toMatchObject({ category: "timeout", retryable: true });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("接続できなければ network", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      listGmailMessages({ userId: USER, connectionId: CONN, query: "x" }),
    ).rejects.toMatchObject({ category: "network" });
  });
});

describe("getGmailMessageMetadata", () => {
  it("format=metadata で From / Subject / Date / Message-ID だけを要求し、snippet と余分なヘッダーを捨てる", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: "m1",
        threadId: "t1",
        internalDate: "1757000000000",
        labelIds: ["INBOX"],
        snippet: "ご利用金額 12,345円 …（これは表示してはいけない）",
        payload: {
          headers: [
            { name: "From", value: "\"Card Co\" <info@example.test>" },
            { name: "Subject", value: "ご利用明細" },
            { name: "Date", value: "Mon, 01 Sep 2026 10:00:00 +0900" },
            { name: "Message-ID", value: "<abc@example.test>" },
            { name: "To", value: "someone@example.test" },
            { name: "Cc", value: "other@example.test" },
          ],
        },
      }),
    );

    const meta = await getGmailMessageMetadata({ userId: USER, connectionId: CONN, messageId: "m1" });

    const { url } = lastRequest();
    expect(url.pathname).toBe("/gmail/v1/users/me/messages/m1");
    expect(url.searchParams.get("format")).toBe("metadata");
    expect(url.searchParams.getAll("metadataHeaders")).toEqual(["From", "Subject", "Date", "Message-ID"]);

    expect(meta.headers).toEqual({
      from: "\"Card Co\" <info@example.test>",
      subject: "ご利用明細",
      date: "Mon, 01 Sep 2026 10:00:00 +0900",
      "message-id": "<abc@example.test>",
    });
    expect(meta.headers).not.toHaveProperty("to");
    expect(meta.headers).not.toHaveProperty("cc");
    expect(meta).not.toHaveProperty("snippet");
    expect(meta).not.toHaveProperty("payload");
    expect(meta.internalDate).toBe("1757000000000");
  });

  it("本文を取得する format（full / raw）は決して要求しない", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "m1", threadId: "t1" }));
    await getGmailMessageMetadata({ userId: USER, connectionId: CONN, messageId: "m1" });
    const format = lastRequest().url.searchParams.get("format");
    expect(format).toBe("metadata");
    expect(format).not.toMatch(/full|raw/);
  });

  it("404（削除済みメール）は not_found", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: { message: "Not Found" } }));
    await expect(
      getGmailMessageMetadata({ userId: USER, connectionId: CONN, messageId: "gone" }),
    ).rejects.toMatchObject({ category: "not_found", status: 404 });
  });
});

describe("getGmailMessageFull（STEP 8B・本文つき）", () => {
  it("format=full を要求し、ヘッダーは From / Subject / Date だけ残し、snippet を捨てる", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: "m1",
        threadId: "t1",
        internalDate: "1757000000000",
        labelIds: ["INBOX"],
        snippet: "ご利用金額 12,345円 …（これは表示してはいけない）",
        payload: {
          mimeType: "multipart/alternative",
          headers: [
            { name: "From", value: "\"Card Co\" <info@example.test>" },
            { name: "Subject", value: "ご請求金額のご案内" },
            { name: "Date", value: "Mon, 01 Sep 2026 10:00:00 +0900" },
            { name: "Message-ID", value: "<abc@example.test>" },
            { name: "To", value: "someone@example.test" },
          ],
          parts: [{ mimeType: "text/plain", body: { size: 4, data: "dGVzdA" } }],
        },
      }),
    );

    const full = await getGmailMessageFull({ userId: USER, connectionId: CONN, messageId: "m1" });

    const { url, init } = lastRequest();
    expect(url.pathname).toBe("/gmail/v1/users/me/messages/m1");
    expect(url.searchParams.get("format")).toBe("full");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-access-token");

    expect(full.headers).toEqual({
      from: "\"Card Co\" <info@example.test>",
      subject: "ご請求金額のご案内",
      date: "Mon, 01 Sep 2026 10:00:00 +0900",
    });
    expect(full.headers).not.toHaveProperty("to");
    expect(full.headers).not.toHaveProperty("message-id");
    expect(full).not.toHaveProperty("snippet");
    expect(full.payload?.parts?.[0].body?.data).toBe("dGVzdA");
    expect(full.internalDate).toBe("1757000000000");
    expect(full.tokenRefreshed).toBe(false);
  });

  it("必ず getValidGoogleAccessToken を通す（別のトークン取得経路を持たない）", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "m1", threadId: "t1" }));
    await getGmailMessageFull({ userId: USER, connectionId: CONN, messageId: "m1" });
    expect(getValidGoogleAccessToken).toHaveBeenCalledWith({ userId: USER, connectionId: CONN });
  });

  it("失敗時は分類だけを持つ GmailApiError になる（本文は持ち回らない）", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: { code: 404, message: "Requested entity was not found. token=SECRET" } }));
    await expect(getGmailMessageFull({ userId: USER, connectionId: CONN, messageId: "gone" })).rejects.toMatchObject({
      name: "GmailApiError",
      category: "not_found",
      status: 404,
    });
  });
});

describe("categorizeGmailStatus", () => {
  it("分類表", () => {
    expect(categorizeGmailStatus(401)).toBe("unauthorized");
    expect(categorizeGmailStatus(403)).toBe("forbidden");
    expect(categorizeGmailStatus(403, "rateLimitExceeded")).toBe("rate_limited");
    expect(categorizeGmailStatus(403, "quotaExceeded")).toBe("rate_limited");
    expect(categorizeGmailStatus(429)).toBe("rate_limited");
    expect(categorizeGmailStatus(404)).toBe("not_found");
    expect(categorizeGmailStatus(400)).toBe("bad_request");
    expect(categorizeGmailStatus(502)).toBe("server_error");
    expect(categorizeGmailStatus(418)).toBe("unknown");
  });
});
