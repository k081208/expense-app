import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardConnectionAssignmentRow, CardRow, ConnectionRow } from "@/types/database";

/**
 * 探索の実行部分のテスト。
 * DB（RLS 経由の読み出し）と Gmail API クライアントをモックし、
 *   - 単位ごとに検索が 1 回だけ行われること
 *   - 本文を取る関数が呼ばれないこと
 *   - 失敗しても他の単位に影響しないこと
 * を確かめる。
 */

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const listAllCards = vi.fn();
const listGmailAssignments = vi.fn();
const listGmailConnections = vi.fn();
vi.mock("@/lib/cards/queries", () => ({ listAllCards: () => listAllCards() }));
vi.mock("../connections", () => ({
  listGmailAssignments: () => listGmailAssignments(),
  listGmailConnections: () => listGmailConnections(),
}));

const listGmailMessages = vi.fn();
const getGmailMessageMetadata = vi.fn();
vi.mock("../client", async () => {
  const actual = await vi.importActual<typeof import("../client")>("../client");
  return {
    GmailApiError: actual.GmailApiError,
    listGmailMessages: (...a: unknown[]) => listGmailMessages(...a),
    getGmailMessageMetadata: (...a: unknown[]) => getGmailMessageMetadata(...a),
  };
});
vi.mock("../tokens", () => ({ shortConnectionRef: () => "abcd1234" }));

import { GmailApiError } from "../client";
import { runGmailDiscovery } from "../discovery-run";

const USER = "user-a";
const NOW = "2026-09-01T00:00:00Z";

const card = (id: string, provider: string, name: string): CardRow => ({
  id, user_id: USER, provider_key: provider, display_name: name, last_four: null,
  payment_day: null, preferred_source: "gmail", enabled: true, created_at: NOW, updated_at: NOW,
});
const conn = (id: string, email: string): ConnectionRow => ({
  id, user_id: USER, kind: "gmail", provider_key: "google", external_account_id: `sub-${id}`,
  account_email: email, status: "connected", scopes: [], connected_at: NOW, expires_at: null,
  last_synced_at: null, last_error_code: null, created_at: NOW, updated_at: NOW,
});
const assign = (cardId: string, connectionId: string): CardConnectionAssignmentRow => ({
  id: `a-${cardId}`, user_id: USER, card_id: cardId, connection_id: connectionId,
  source: "gmail", enabled: true, created_at: NOW, updated_at: NOW,
});

beforeEach(() => {
  listAllCards.mockResolvedValue([
    card("r1", "rakuten", "楽天ゴールド"),
    card("r2", "rakuten", "楽天PINK"),
    card("j1", "jcb", "JCB メイン"),
    card("j2", "jcb", "JCB サブ"),
    card("ed", "edion", "エディオンカード"),
  ]);
  listGmailConnections.mockResolvedValue([conn("conn-a", "alpha.user@example.test"), conn("conn-b", "bravo.user@example.test")]);
  listGmailAssignments.mockResolvedValue([
    assign("r1", "conn-a"), assign("r2", "conn-a"),
    assign("j1", "conn-b"), assign("j2", "conn-b"),
    // エディオンは割り当て無し
  ]);
  listGmailMessages.mockResolvedValue({
    messages: [{ id: "m1", threadId: "t1" }, { id: "m2", threadId: "t2" }],
    nextPageToken: null, resultSizeEstimate: 2, tokenRefreshed: false,
  });
  getGmailMessageMetadata.mockImplementation(async ({ messageId }: { messageId: string }) => ({
    id: messageId, threadId: "t", internalDate: "1757000000000", labelIds: ["INBOX"],
    headers: { from: "Card <info@example.test>", subject: `ご利用金額 ${messageId === "m1" ? "1,000" : "2,000"}円` },
    tokenRefreshed: false,
  }));
});

describe("runGmailDiscovery", () => {
  it("楽天 2 枚・JCB 2 枚でも、provider × connection ごとに検索は 1 回ずつ", async () => {
    const report = await runGmailDiscovery(USER);

    expect(listGmailMessages).toHaveBeenCalledTimes(2);
    const calls = listGmailMessages.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: USER, connectionId: "conn-a", query: expect.stringContaining("楽天") }),
        expect.objectContaining({ userId: USER, connectionId: "conn-b", query: expect.stringContaining("JCB") }),
      ]),
    );
    expect(report.results).toHaveLength(2);
    expect(report.plan.unassignedCards).toEqual([{ cardName: "エディオンカード", providerKey: "edion" }]);
  });

  it("Gmail A の検索に Gmail B の連携を使わない（混ざらない）", async () => {
    await runGmailDiscovery(USER);
    for (const [args] of listGmailMessages.mock.calls) {
      if (String(args.query).includes("楽天")) expect(args.connectionId).toBe("conn-a");
      if (String(args.query).includes("JCB")) expect(args.connectionId).toBe("conn-b");
    }
    for (const [args] of getGmailMessageMetadata.mock.calls) {
      expect(["conn-a", "conn-b"]).toContain(args.connectionId);
    }
  });

  it("既定は 365 日・上限 50 件・迷惑メールとゴミ箱を除外", async () => {
    const report = await runGmailDiscovery(USER);
    expect(report.days).toBe(365);
    expect(report.maxResults).toBe(50);
    expect(report.includeSpamTrash).toBe(false);
    expect(listGmailMessages.mock.calls[0][0]).toMatchObject({
      maxResults: 50, includeSpamTrash: false, query: expect.stringContaining("newer_than:365d"),
    });
  });

  it("期間・上限は設定値で変えられ、天井で丸められる", async () => {
    const report = await runGmailDiscovery(USER, { days: 90, maxResults: 9999, includeSpamTrash: true });
    expect(report.days).toBe(90);
    expect(report.maxResults).toBe(200);
    expect(listGmailMessages.mock.calls[0][0]).toMatchObject({ maxResults: 200, includeSpamTrash: true });
  });

  it("候補ごとに metadata だけを取り、集計結果には生の件名を残さない", async () => {
    const report = await runGmailDiscovery(USER);
    expect(getGmailMessageMetadata).toHaveBeenCalledTimes(4); // 2 単位 × 2 件
    const rakuten = report.results.find((r) => r.providerKey === "rakuten")!;
    expect(rakuten.aggregate.candidateCount).toBe(2);
    expect(rakuten.aggregate.fromCounts).toEqual([{ address: "info@example.test", name: "Card", count: 2 }]);
    expect(rakuten.aggregate.subjectTemplates).toEqual([{ template: "ご利用金額 [AMOUNT]", count: 2 }]);
    expect(JSON.stringify(report)).not.toContain("1,000");
    expect(JSON.stringify(report)).not.toContain("alpha.user@");
  });

  it("一覧取得に失敗した単位はエラー分類だけを持ち、他の単位は続行する", async () => {
    listGmailMessages.mockImplementation(async ({ connectionId }: { connectionId: string }) => {
      if (connectionId === "conn-a") throw new GmailApiError("rate_limited", 429);
      return { messages: [{ id: "m9", threadId: "t9" }], nextPageToken: "MORE", resultSizeEstimate: 80, tokenRefreshed: true };
    });
    const report = await runGmailDiscovery(USER);
    const rakuten = report.results.find((r) => r.providerKey === "rakuten")!;
    const jcb = report.results.find((r) => r.providerKey === "jcb")!;
    expect(rakuten.error).toBe("rate_limited");
    expect(rakuten.aggregate.candidateCount).toBe(0);
    expect(jcb.error).toBeNull();
    expect(jcb.hasMore).toBe(true);
    expect(jcb.tokenRefreshed).toBe(true);
  });

  it("一部の候補のヘッダー取得に失敗しても、件数として記録して続行する", async () => {
    getGmailMessageMetadata.mockImplementation(async ({ messageId }: { messageId: string }) => {
      if (messageId === "m2") throw new GmailApiError("not_found", 404);
      return { id: messageId, threadId: "t", internalDate: null, labelIds: [], headers: { from: "x@example.test", subject: "件名" }, tokenRefreshed: false };
    });
    const report = await runGmailDiscovery(USER);
    const rakuten = report.results.find((r) => r.providerKey === "rakuten")!;
    expect(rakuten.aggregate.candidateCount).toBe(1);
    expect(rakuten.fetchErrors).toEqual([{ category: "not_found", count: 1 }]);
  });

  it("query には -from:me が入る（自分が送ったメールを候補にしない）", async () => {
    await runGmailDiscovery(USER);
    for (const [args] of listGmailMessages.mock.calls) expect(args.query).toContain("-from:me");
  });

  it("providerKey を指定すると、その会社の単位だけを探索する", async () => {
    const report = await runGmailDiscovery(USER, { providerKey: "jcb" });
    expect(listGmailMessages).toHaveBeenCalledTimes(1);
    expect(listGmailMessages.mock.calls[0][0]).toMatchObject({ connectionId: "conn-b" });
    expect(report.providerKey).toBe("jcb");
    expect(report.results.map((r) => r.providerKey)).toEqual(["jcb"]);
  });

  it("割り当てに無い会社を providerKey に指定しても何も呼ばない", async () => {
    const report = await runGmailDiscovery(USER, { providerKey: "amex" });
    expect(listGmailMessages).not.toHaveBeenCalled();
    expect(report.results).toEqual([]);
  });

  it("extraQuery は整えたうえで検索条件の末尾に付き、結果にも記録される", async () => {
    const report = await runGmailDiscovery(USER, { providerKey: "rakuten", extraQuery: " from:example.co.jp\n" });
    expect(listGmailMessages.mock.calls[0][0].query).toMatch(/ -from:me from:example\.co\.jp$/);
    expect(report.extraQuery).toBe("from:example.co.jp");
    expect(report.results[0].query).toContain("from:example.co.jp");
  });

  it("探索できる単位が無ければ Gmail API を一切呼ばない", async () => {
    listGmailAssignments.mockResolvedValue([]);
    const report = await runGmailDiscovery(USER);
    expect(report.results).toEqual([]);
    expect(listGmailMessages).not.toHaveBeenCalled();
    expect(getGmailMessageMetadata).not.toHaveBeenCalled();
  });
});
