import { describe, expect, it } from "vitest";
import { buildOfficialGmailQuery, clampLookbackDays, clampMaxMessages } from "../config/query";
import { rakutenGmailRule } from "../parsers/rakuten";
import { gmailParserRegistry } from "../registry";
import { toNormalizedBilling } from "../types";
import { getProvider } from "@/providers/registry";

describe("gmailParserRegistry", () => {
  it("Tier A の 5 社が正式対応、Tier B / C は理由つきで未対応", () => {
    expect(gmailParserRegistry.official().map((p) => p.providerKey).sort()).toEqual(
      ["amex", "jaccs", "jcb", "paypay", "rakuten"],
    );
    expect(gmailParserRegistry.supportOf("edion")).toMatchObject({ level: "unsupported", reason: "insufficient_real_samples" });
    expect(gmailParserRegistry.supportOf("aeon")).toMatchObject({ level: "unsupported", reason: "limited_sample" });
    expect(gmailParserRegistry.supportOf("saison")).toMatchObject({ level: "unsupported", reason: "limited_sample" });
    expect(gmailParserRegistry.supportOf("aupay")).toMatchObject({ level: "unsupported", reason: "waiting_for_real_sample" });
    expect(gmailParserRegistry.supportOf("smbc")).toEqual({ level: "unsupported", reason: "not_implemented" });
    expect(gmailParserRegistry.get("smbc")).toBeUndefined();
  });
  it("get(providerKey) で Parser を引ける", () => {
    expect(gmailParserRegistry.get("rakuten")?.providerKey).toBe("rakuten");
    expect(gmailParserRegistry.get("jcb")?.classifySubject("JCBカード2026年9月分お振替内容変更のご案内")).toBe("changed");
  });
  it("STEP 9 の BillingProvider 登録簿とは分かれている（そちらは未登録のまま）", () => {
    expect(getProvider("rakuten", "gmail")).toBeUndefined();
  });
});

describe("buildOfficialGmailQuery（正式な検索条件）", () => {
  it("from と subject と newer_than で絞り、-from:me を付ける", () => {
    const q = buildOfficialGmailQuery(rakutenGmailRule, 120);
    expect(q).toBe(
      'from:info@mail.rakuten-card.co.jp subject:("カードご請求金額のご案内" OR "ご請求予定金額のご案内" OR "お支払予定金額のご案内" OR "お引き落とし日のご案内") newer_than:120d -from:me',
    );
  });
  it("送信元が複数なら from:( ... OR ... )", () => {
    const q = gmailParserRegistry.get("jcb")!.buildQuery(90);
    expect(q).toContain("from:(mail@qa.jcb.co.jp OR mail@cj.jcb.co.jp)");
    expect(q).toContain("newer_than:90d");
  });
  it("探索の広い語（楽天 / JCB など単独）は使わない", () => {
    for (const p of gmailParserRegistry.official()) {
      const q = p.buildQuery(120);
      expect(q).toMatch(/^from:/);
      expect(q).toContain("subject:");
      expect(q).not.toMatch(/\(楽天カード OR 楽天\)/);
    }
  });
  it("期間と件数は天井で丸める", () => {
    expect(clampLookbackDays(9999)).toBe(365);
    expect(clampLookbackDays(0)).toBe(1);
    expect(clampLookbackDays(undefined)).toBe(120);
    expect(clampMaxMessages(500)).toBe(50);
    expect(clampMaxMessages(undefined)).toBe(20);
    expect(buildOfficialGmailQuery(rakutenGmailRule, 9999)).toContain("newer_than:365d");
  });
});

describe("toNormalizedBilling", () => {
  it("カードが特定できたものだけ共通形式にし、source は gmail", () => {
    const parsed = gmailParserRegistry.get("paypay")!.parse(
      {
        from: "<paypaycard-info@mail.paypay-card.co.jp>",
        subject: "9月の請求金額のお知らせ",
        receivedAt: "2026-09-12T00:00:00.000Z",
        bodyText: "ご請求金額 1,000円\nお支払い日 2026年9月27日",
        bodyStatus: "ok",
      },
      [{ id: "card-p", displayName: "PayPay", lastFour: null }],
    );
    expect(toNormalizedBilling(parsed, "2026-09-12T01:00:00.000Z")).toEqual({
      cardId: "card-p",
      provider: "paypay",
      amount: 1000,
      paymentDate: "2026-09-27",
      source: "gmail",
      fetchedAt: "2026-09-12T01:00:00.000Z",
      status: "success",
      isProvisional: false,
    });
    expect(toNormalizedBilling({ ...parsed, cardId: null }, "x")).toBeNull();
  });
});
