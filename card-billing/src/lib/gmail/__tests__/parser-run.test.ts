import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardConnectionAssignmentRow, CardRow, ConnectionRow } from "@/types/database";

/**
 * Parser 実行部分のテスト。
 * DB（RLS 経由の読み出し）と Gmail API クライアントをモックし、
 *   - 正式な検索条件で検索し、一致した少数のメールだけ本文（format=full）を取ること
 *   - 結果・ログに本文・件名・message ID が出ないこと
 *   - DB へ書かないこと
 *   - 失敗しても他の単位に影響しないこと
 * を確かめる。本文はすべて架空。
 */

const logInfo = vi.fn();
const logWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { info: (...a: unknown[]) => logInfo(...a), warn: (...a: unknown[]) => logWarn(...a), error: vi.fn() },
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
const getGmailMessageFull = vi.fn();
const getGmailMessageMetadata = vi.fn();
vi.mock("../client", async () => {
  const actual = await vi.importActual<typeof import("../client")>("../client");
  return {
    GmailApiError: actual.GmailApiError,
    listGmailMessages: (...a: unknown[]) => listGmailMessages(...a),
    getGmailMessageFull: (...a: unknown[]) => getGmailMessageFull(...a),
    getGmailMessageMetadata: (...a: unknown[]) => getGmailMessageMetadata(...a),
  };
});
vi.mock("../tokens", () => ({ shortConnectionRef: () => "abcd1234" }));

import { GmailApiError } from "../client";
import { runGmailParserPreview, toReceivedAtIso } from "../parser-run";

const USER = "user-a";
const NOW = "2026-09-01T00:00:00Z";
const AS_OF = new Date("2026-09-12T00:00:00Z");

const card = (id: string, provider: string, name: string, lastFour: string | null): CardRow => ({
  id, user_id: USER, provider_key: provider, display_name: name, last_four: lastFour,
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

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const SECRET_BODY_MARKER = "BODY-MARKER-ありがとうございます";
const mail = (id: string, from: string, subject: string, body: string, internalDate: string) => ({
  id, threadId: `t-${id}`, internalDate, labelIds: ["INBOX"],
  headers: { from, subject, date: "Mon, 01 Sep 2026 10:00:00 +0900" },
  payload: { mimeType: "text/plain", body: { size: body.length, data: b64(`${SECRET_BODY_MARKER}\n${body}`) } },
  tokenRefreshed: false,
});

const RAKUTEN_FROM = '"楽天カード" <info@mail.rakuten-card.co.jp>';
const MAILS: Record<string, ReturnType<typeof mail>> = {
  r1: mail("r1", RAKUTEN_FROM, "【楽天カード】カードご請求金額のご案内", "下4桁 1234\nご請求金額 12,345円\nお支払い日 2026年9月27日", "1757000000000"),
  r2: mail("r2", RAKUTEN_FROM, "【楽天カード】カードご請求金額のご案内", "下4桁 5678\nご請求金額 6,789円\nお支払い日 2026年9月27日", "1757100000000"),
  r3: mail("r3", '"偽" <info@mail-rakuten-card.co.jp>', "【楽天カード】カードご請求金額のご案内", "下4桁 1234\nご請求金額 99,999円\nお支払い日 2026年9月27日", "1757200000000"),
  r4: mail("r4", RAKUTEN_FROM, "カード利用のお知らせ(本人ご利用分)", "ご利用金額 500円", "1757300000000"),
  j1: mail("j1", "<mail@qa.jcb.co.jp>", "JCBカード2026年9月分お振替内容確定のご案内", "****-****-****-1111\nお振替金額 45,678円\nお振替日 2026年9月10日", "1757000000000"),
  j2: mail("j2", "<mail@qa.jcb.co.jp>", "JCBカード2026年9月分お振替内容変更のご案内", "****-****-****-1111\n変更前のお振替金額 45,678円\n変更後のお振替金額 40,000円\nお振替日 2026年9月10日", "1757400000000"),
};

beforeEach(() => {
  listAllCards.mockResolvedValue([
    card("r-a", "rakuten", "楽天 A", "1234"),
    card("r-b", "rakuten", "楽天 B", "5678"),
    card("j-a", "jcb", "JCB メイン", "1111"),
    card("ed", "edion", "エディオンカード", null),
    card("au", "aupay", "au PAY", null),
    card("pp", "paypay", "PayPay", null),
  ]);
  listGmailConnections.mockResolvedValue([conn("conn-a", "alpha.user@example.test"), conn("conn-b", "bravo.user@example.test")]);
  listGmailAssignments.mockResolvedValue([
    assign("r-a", "conn-a"), assign("r-b", "conn-a"), assign("j-a", "conn-b"), assign("ed", "conn-b"), assign("au", "conn-a"),
    // PayPay は割り当て無し
  ]);
  listGmailMessages.mockImplementation(async ({ query }: { query: string }) => {
    if (query.includes("rakuten-card")) {
      return { messages: ["r1", "r2", "r3", "r4"].map((id) => ({ id, threadId: `t-${id}` })), nextPageToken: null, resultSizeEstimate: 4, tokenRefreshed: false };
    }
    if (query.includes("jcb.co.jp")) {
      return { messages: ["j1", "j2"].map((id) => ({ id, threadId: `t-${id}` })), nextPageToken: "MORE", resultSizeEstimate: 30, tokenRefreshed: true };
    }
    return { messages: [], nextPageToken: null, resultSizeEstimate: 0, tokenRefreshed: false };
  });
  getGmailMessageFull.mockImplementation(async ({ messageId }: { messageId: string }) => {
    const m = MAILS[messageId];
    if (!m) throw new GmailApiError("not_found", 404);
    return structuredClone(m);
  });
});

describe("runGmailParserPreview", () => {
  it("正式対応の会社 × 連携 ごとに正式な検索条件で 1 回ずつ検索する", async () => {
    const report = await runGmailParserPreview(USER, { now: AS_OF });
    expect(listGmailMessages).toHaveBeenCalledTimes(2);
    const calls = listGmailMessages.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: USER, connectionId: "conn-a", query: expect.stringMatching(/^from:info@mail\.rakuten-card\.co\.jp subject:\(/), maxResults: 20, includeSpamTrash: false }),
      expect.objectContaining({ userId: USER, connectionId: "conn-b", query: expect.stringContaining("from:(mail@qa.jcb.co.jp OR mail@cj.jcb.co.jp)") }),
    ]));
    for (const c of calls) expect(c.query).toContain("newer_than:120d");
    expect(report.results.map((r) => r.providerKey).sort()).toEqual(["jcb", "rakuten"]);
  });

  it("未対応の会社は検索せず、理由つきで対象外に載る。割り当て無しも別に載る", async () => {
    const report = await runGmailParserPreview(USER, { now: AS_OF });
    expect(report.plan.unsupportedCards).toEqual(expect.arrayContaining([
      { cardName: "エディオンカード", providerKey: "edion", reason: "insufficient_real_samples" },
      { cardName: "au PAY", providerKey: "aupay", reason: "waiting_for_real_sample" },
    ]));
    expect(report.plan.unassignedCards).toEqual([{ cardName: "PayPay", providerKey: "paypay" }]);
    for (const [args] of listGmailMessages.mock.calls) {
      expect(args.query).not.toContain("orico");
      expect(args.query).not.toContain("au");
    }
  });

  it("本文（format=full）は検索に一致したメールだけに取り、metadata 取得は使わない", async () => {
    await runGmailParserPreview(USER, { now: AS_OF });
    expect(getGmailMessageFull).toHaveBeenCalledTimes(6);
    expect(getGmailMessageMetadata).not.toHaveBeenCalled();
    for (const [args] of getGmailMessageFull.mock.calls) {
      if (args.messageId.startsWith("r")) expect(args.connectionId).toBe("conn-a");
      if (args.messageId.startsWith("j")) expect(args.connectionId).toBe("conn-b");
    }
  });

  it("解析結果: 楽天 2 枚を下 4 桁で分け、偽の送信元と利用速報は失敗として分類される", async () => {
    const report = await runGmailParserPreview(USER, { now: AS_OF });
    const rakuten = report.results.find((r) => r.providerKey === "rakuten")!;
    expect(rakuten.listed).toBe(4);
    const byCard = new Map(rakuten.messages.filter((m) => m.status === "success").map((m) => [m.cardId, m]));
    expect(byCard.get("r-a")).toMatchObject({ amount: 12345, paymentDate: "2026-09-27", matchedBy: "last_four" });
    expect(byCard.get("r-b")).toMatchObject({ amount: 6789, paymentDate: "2026-09-27" });
    expect(rakuten.messages.map((m) => m.errorCode).filter(Boolean).sort()).toEqual(["sender_mismatch", "subject_mismatch"]);
    expect(rakuten.current.map((c) => [c.cardDisplayName, c.amount]).sort()).toEqual([["楽天 A", 12345], ["楽天 B", 6789]]);
  });

  it("JCB: 確定の後に届いた変更を採用する。トークン更新・続きありも伝える", async () => {
    const report = await runGmailParserPreview(USER, { now: AS_OF });
    const jcb = report.results.find((r) => r.providerKey === "jcb")!;
    expect(jcb.current).toHaveLength(1);
    expect(jcb.current[0]).toMatchObject({ cardId: "j-a", amount: 40000, mailClass: "changed", paymentDate: "2026-09-10" });
    expect(jcb.tokenRefreshed).toBe(true);
    expect(jcb.hasMore).toBe(true);
    // 受信日時の新しい順
    expect(jcb.messages.map((m) => m.mailClass)).toEqual(["changed", "confirmed"]);
  });

  it("結果にもログにも本文・件名・message ID・生の Gmail アドレスを含めない", async () => {
    const report = await runGmailParserPreview(USER, { now: AS_OF, includeDebug: true });
    const json = JSON.stringify(report);
    expect(json).not.toContain(SECRET_BODY_MARKER);
    expect(json).not.toContain("ありがとうございます");
    // 件名そのもの（検索条件の語は含まれてよい）
    expect(json).not.toContain("【楽天カード】");
    expect(json).not.toContain("JCBカード2026年");
    expect(json).not.toMatch(/"r1"|"j1"|t-r1/);
    expect(json).not.toContain("alpha.user@");
    expect(json).toContain("al***@example.test");
    const logged = JSON.stringify([...logInfo.mock.calls, ...logWarn.mock.calls]);
    expect(logged).not.toContain(SECRET_BODY_MARKER);
    expect(logged).not.toContain("12,345");
    expect(logged).not.toContain("r1");
    expect(logged).toContain("abcd1234");
  });

  it("includeDebug を付けなければ抽出過程は空", async () => {
    const report = await runGmailParserPreview(USER, { now: AS_OF });
    for (const r of report.results) for (const m of r.messages) expect(m.debug).toEqual([]);
    const withDebug = await runGmailParserPreview(USER, { now: AS_OF, includeDebug: true });
    expect(withDebug.results.some((r) => r.messages.some((m) => m.debug.length > 0))).toBe(true);
  });

  it("一覧取得に失敗した単位は分類だけを持ち、他の単位は続行する", async () => {
    listGmailMessages.mockImplementation(async ({ connectionId }: { connectionId: string }) => {
      if (connectionId === "conn-a") throw new GmailApiError("rate_limited", 429);
      return { messages: [{ id: "j1", threadId: "t-j1" }], nextPageToken: null, resultSizeEstimate: 1, tokenRefreshed: false };
    });
    const report = await runGmailParserPreview(USER, { now: AS_OF });
    expect(report.results.find((r) => r.providerKey === "rakuten")).toMatchObject({ error: "rate_limited", messages: [] });
    expect(report.results.find((r) => r.providerKey === "jcb")).toMatchObject({ error: null, listed: 1 });
  });

  it("一部の本文取得に失敗しても件数として記録して続行する", async () => {
    getGmailMessageFull.mockImplementation(async ({ messageId }: { messageId: string }) => {
      if (messageId === "r2") throw new GmailApiError("server_error", 500);
      return structuredClone(MAILS[messageId]);
    });
    const report = await runGmailParserPreview(USER, { now: AS_OF });
    const rakuten = report.results.find((r) => r.providerKey === "rakuten")!;
    expect(rakuten.fetchErrors).toEqual([{ category: "server_error", count: 1 }]);
    expect(rakuten.messages).toHaveLength(3);
  });

  it("providerKey・期間・件数の指定が反映され、天井で丸められる", async () => {
    const report = await runGmailParserPreview(USER, { now: AS_OF, providerKey: "jcb", days: 9999, maxMessages: 999 });
    expect(listGmailMessages).toHaveBeenCalledTimes(1);
    expect(listGmailMessages.mock.calls[0][0]).toMatchObject({ connectionId: "conn-b", maxResults: 50, query: expect.stringContaining("newer_than:365d") });
    expect(report).toMatchObject({ providerKey: "jcb", days: 365, maxMessages: 50 });
  });

  it("解析できる単位が無ければ Gmail API を呼ばない", async () => {
    listGmailAssignments.mockResolvedValue([]);
    const report = await runGmailParserPreview(USER, { now: AS_OF });
    expect(report.results).toEqual([]);
    expect(listGmailMessages).not.toHaveBeenCalled();
    expect(getGmailMessageFull).not.toHaveBeenCalled();
  });

  it("未対応の会社は includeCandidates のときだけ「試行」単位になり、採用候補には入らない", async () => {
    listGmailMessages.mockImplementation(async ({ query }: { query: string }) => {
      if (query.includes("orico.co.jp")) return { messages: [{ id: "o1", threadId: "t-o1" }], nextPageToken: null, resultSizeEstimate: 1, tokenRefreshed: false };
      return { messages: [], nextPageToken: null, resultSizeEstimate: 0, tokenRefreshed: false };
    });
    getGmailMessageFull.mockImplementation(async ({ messageId }: { messageId: string }) => {
      if (messageId === "o1") return mail("o1", "<e-ask@orico.co.jp>", "ご利用明細更新のお知らせ", "ご請求金額 1,000円\nお支払い日 2026年9月27日", "1757000000000");
      throw new GmailApiError("not_found", 404);
    });

    const without = await runGmailParserPreview(USER, { now: AS_OF });
    expect(without.results.some((r) => r.providerKey === "edion")).toBe(false);
    expect(without.plan.unsupportedCards.some((c) => c.providerKey === "edion")).toBe(true);

    const withTrial = await runGmailParserPreview(USER, { now: AS_OF, includeCandidates: true, includeDebug: true });
    const edion = withTrial.results.find((r) => r.providerKey === "edion")!;
    expect(edion).toMatchObject({ trial: true, listed: 1, current: [] });
    expect(edion.query).toMatch(/^from:\(e-ask@orico\.co\.jp OR e-service@orico\.co\.jp\) subject:/);
    expect(edion.messages[0]).toMatchObject({ status: "success", trial: true, amount: 1000 });
    expect(withTrial.plan.unsupportedCards.some((c) => c.providerKey === "edion")).toBe(false);
    // au PAY（実メール待ち）は試行しない
    expect(withTrial.results.some((r) => r.providerKey === "aupay")).toBe(false);
    expect(withTrial.plan.unsupportedCards.some((c) => c.providerKey === "aupay")).toBe(true);
  });

  it("受信日時は Gmail の internalDate を優先し、無いときだけ Date ヘッダーを使う", () => {
    expect(toReceivedAtIso("1757000000000", "Mon, 01 Sep 2026 10:00:00 +0900")).toBe("2025-09-04T15:33:20.000Z");
    expect(toReceivedAtIso(null, "Mon, 01 Sep 2026 10:00:00 +0900")).toBe("2026-09-01T01:00:00.000Z");
    expect(toReceivedAtIso("not-a-number", "Mon, 01 Sep 2026 10:00:00 +0900")).toBe("2026-09-01T01:00:00.000Z");
    expect(toReceivedAtIso(null, null)).toBe("1970-01-01T00:00:00.000Z");
  });

  it("実行部分と Parser は DB へ書き込むコードを持たない（billing_records への保存は STEP 10）", () => {
    const files = ["../parser-run.ts", "../parser-actions.ts", "../parser-plan.ts"].map((f) =>
      readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8"),
    );
    for (const src of files) {
      expect(src).not.toMatch(/from\(\s*["']billing_records/);
      expect(src).not.toMatch(/\.(insert|upsert|update|delete|rpc)\(/);
      expect(src).not.toMatch(/createServiceRoleClient|service_role/);
    }
  });
});
