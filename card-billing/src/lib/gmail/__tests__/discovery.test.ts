import { describe, expect, it } from "vitest";
import type { CardConnectionAssignmentRow, CardRow, ConnectionRow } from "@/types/database";
import {
  aggregateCandidates,
  buildDiscoveryQuery,
  DISCOVERY_TERMS,
  isDiscoverableProvider,
  maskEmail,
  parseFromHeader,
  planDiscoveryTargets,
  sanitizeSubject,
} from "../discovery";

/**
 * 探索（Discovery）の純粋な計算部分のテスト。
 * ここで使うメールアドレス・件名はすべて架空の値。
 */

const USER = "user-a";
const NOW = "2026-09-01T00:00:00Z";

function card(id: string, provider: string, name: string, overrides: Partial<CardRow> = {}): CardRow {
  return {
    id,
    user_id: USER,
    provider_key: provider,
    display_name: name,
    last_four: null,
    payment_day: null,
    preferred_source: "gmail",
    enabled: true,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function connection(id: string, email: string, status: ConnectionRow["status"] = "connected"): ConnectionRow {
  return {
    id,
    user_id: USER,
    kind: "gmail",
    provider_key: "google",
    external_account_id: `sub-${id}`,
    account_email: email,
    status,
    scopes: [],
    connected_at: NOW,
    expires_at: null,
    last_synced_at: null,
    last_error_code: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function assign(cardId: string, connectionId: string): CardConnectionAssignmentRow {
  return {
    id: `a-${cardId}`,
    user_id: USER,
    card_id: cardId,
    connection_id: connectionId,
    source: "gmail",
    enabled: true,
    created_at: NOW,
    updated_at: NOW,
  };
}

const GMAIL_A = connection("conn-a", "alpha.user@example.test");
const GMAIL_B = connection("conn-b", "bravo.user@example.test");

describe("planDiscoveryTargets", () => {
  it("楽天 2 枚が同じ Gmail なら探索は 1 単位（検索 1 回）", () => {
    const cards = [card("c1", "rakuten", "楽天ゴールド"), card("c2", "rakuten", "楽天PINK")];
    const plan = planDiscoveryTargets({
      cards,
      assignments: [assign("c1", GMAIL_A.id), assign("c2", GMAIL_A.id)],
      connections: [GMAIL_A],
    });
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]).toMatchObject({
      providerKey: "rakuten",
      connectionId: "conn-a",
      cardNames: ["楽天ゴールド", "楽天PINK"],
    });
  });

  it("JCB 2 枚が同じ Gmail なら探索は 1 単位（検索 1 回）", () => {
    const cards = [card("c5", "jcb", "JCB メイン"), card("c6", "jcb", "JCB サブ")];
    const plan = planDiscoveryTargets({
      cards,
      assignments: [assign("c5", GMAIL_B.id), assign("c6", GMAIL_B.id)],
      connections: [GMAIL_B],
    });
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0].cardNames).toEqual(["JCB メイン", "JCB サブ"]);
  });

  it("Gmail A と B は混ざらない（同じ会社でも別の Gmail なら別の単位）", () => {
    const cards = [card("c1", "rakuten", "楽天ゴールド"), card("c2", "rakuten", "楽天PINK")];
    const plan = planDiscoveryTargets({
      cards,
      assignments: [assign("c1", GMAIL_A.id), assign("c2", GMAIL_B.id)],
      connections: [GMAIL_A, GMAIL_B],
    });
    expect(plan.targets).toHaveLength(2);
    expect(plan.targets.map((t) => t.connectionId).sort()).toEqual(["conn-a", "conn-b"]);
    const a = plan.targets.find((t) => t.connectionId === "conn-a");
    expect(a?.cardNames).toEqual(["楽天ゴールド"]);
  });

  it("実運用の 11 枚（A=6 / B=5）は 9 社 → 単位は 9 になる", () => {
    const cards = [
      card("r1", "rakuten", "楽天ゴールド"),
      card("r2", "rakuten", "楽天PINK"),
      card("au", "aupay", "au PAYカード"),
      card("ja", "jaccs", "JACCSカード"),
      card("ae", "aeon", "イオンカード"),
      card("sa", "saison", "セゾンカード"),
      card("am", "amex", "AMEX"),
      card("j1", "jcb", "JCB メイン"),
      card("j2", "jcb", "JCB サブ"),
      card("pp", "paypay", "PayPayカード"),
      card("ed", "edion", "エディオンカード"),
    ];
    const toA = ["r1", "r2", "au", "ja", "ae", "sa"];
    const assignments = cards.map((c) => assign(c.id, toA.includes(c.id) ? GMAIL_A.id : GMAIL_B.id));
    const plan = planDiscoveryTargets({ cards, assignments, connections: [GMAIL_A, GMAIL_B] });

    expect(plan.targets).toHaveLength(9);
    expect(plan.targets.filter((t) => t.connectionId === "conn-a")).toHaveLength(5); // 楽天・au・JACCS・イオン・セゾン
    expect(plan.targets.filter((t) => t.connectionId === "conn-b")).toHaveLength(4); // AMEX・JCB・PayPay・エディオン
    expect(plan.unassignedCards).toEqual([]);
  });

  it("割り当てが無いカードは探索しない", () => {
    const cards = [card("c1", "rakuten", "楽天ゴールド"), card("c3", "amex", "AMEX")];
    const plan = planDiscoveryTargets({
      cards,
      assignments: [assign("c1", GMAIL_A.id)],
      connections: [GMAIL_A],
    });
    expect(plan.targets).toHaveLength(1);
    expect(plan.unassignedCards).toEqual([{ cardName: "AMEX", providerKey: "amex" }]);
  });

  it("割り当て先の連携が connected でなければ探索しない", () => {
    const revoked = connection("conn-r", "revoked.user@example.test", "revoked");
    const plan = planDiscoveryTargets({
      cards: [card("c1", "rakuten", "楽天ゴールド")],
      assignments: [assign("c1", revoked.id)],
      connections: [revoked],
    });
    expect(plan.targets).toEqual([]);
    expect(plan.inactiveConnectionCards).toEqual([
      { cardName: "楽天ゴールド", providerKey: "rakuten", status: "revoked" },
    ]);
  });

  it("探索語の無いカード会社と、使用しないカードは対象外", () => {
    const plan = planDiscoveryTargets({
      cards: [
        card("s", "smbc", "三井住友"),
        card("d", "rakuten", "使わない楽天", { enabled: false }),
      ],
      assignments: [assign("s", GMAIL_A.id), assign("d", GMAIL_A.id)],
      connections: [GMAIL_A],
    });
    expect(plan.targets).toEqual([]);
    expect(plan.unsupportedCards).toEqual([{ cardName: "三井住友", providerKey: "smbc" }]);
  });

  it("Gmail アカウントはマスクされた形でしか持たない", () => {
    const plan = planDiscoveryTargets({
      cards: [card("c1", "rakuten", "楽天ゴールド")],
      assignments: [assign("c1", GMAIL_A.id)],
      connections: [GMAIL_A],
    });
    expect(plan.targets[0].accountEmailMasked).toBe("al***@example.test");
    expect(JSON.stringify(plan)).not.toContain("alpha.user@");
  });
});

describe("buildDiscoveryQuery", () => {
  it("探索語を OR で結び、newer_than で期間を絞る", () => {
    expect(buildDiscoveryQuery("rakuten", 365)).toBe("(楽天カード OR 楽天) newer_than:365d");
  });
  it("空白を含む語は引用符で囲む", () => {
    expect(buildDiscoveryQuery("aupay", 90)).toBe('("au PAY" OR auPAY) newer_than:90d');
    expect(buildDiscoveryQuery("amex", 30)).toContain('"American Express"');
  });
  it("期間は 1〜3650 日に丸める", () => {
    expect(buildDiscoveryQuery("jcb", 0)).toContain("newer_than:1d");
    expect(buildDiscoveryQuery("jcb", 99999)).toContain("newer_than:3650d");
  });
  it("対象の 9 社すべてに探索語がある", () => {
    for (const key of ["rakuten", "amex", "jcb", "paypay", "aupay", "aeon", "saison", "jaccs", "edion"]) {
      expect(isDiscoverableProvider(key)).toBe(true);
      expect(DISCOVERY_TERMS[key].length).toBeGreaterThan(0);
    }
    expect(isDiscoverableProvider("smbc")).toBe(false);
    expect(isDiscoverableProvider("other")).toBe(false);
  });
});

describe("maskEmail", () => {
  it("先頭 2 文字とドメインだけを残す", () => {
    expect(maskEmail("skylark.demo@example.test")).toBe("sk***@example.test");
    expect(maskEmail("relay@example.test")).toBe("re***@example.test");
  });
  it("短いローカル部・不正な値・null", () => {
    expect(maskEmail("a@example.test")).toBe("a***@example.test");
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail(null)).toBe("（不明）");
  });
});

describe("sanitizeSubject", () => {
  it("金額を [AMOUNT] にする", () => {
    expect(sanitizeSubject("ご利用金額 12,345円のお知らせ")).toBe("ご利用金額 [AMOUNT]のお知らせ");
    expect(sanitizeSubject("請求額 ¥82,400")).toBe("請求額 [AMOUNT]");
    expect(sanitizeSubject("請求額 ￥82,400")).toBe("請求額 [AMOUNT]");
  });
  it("日付を [DATE] にする", () => {
    expect(sanitizeSubject("2026年9月分のご請求")).toBe("[DATE]のご請求");
    expect(sanitizeSubject("9月27日お支払い分")).toBe("[DATE]お支払い分");
    expect(sanitizeSubject("2026/09/27 ご利用明細")).toBe("[DATE] ご利用明細");
    expect(sanitizeSubject("お支払日 2026-09-10")).toBe("お支払日 [DATE]");
  });
  it("下 4 桁・会員番号など残りの数字を [NUMBER] にする", () => {
    expect(sanitizeSubject("カード末尾4001のご利用")).toBe("カード末尾[NUMBER]のご利用");
    expect(sanitizeSubject("会員番号 1234-5678")).toBe("会員番号 [NUMBER]-[NUMBER]");
  });
  it("全角数字も同じように扱い、空白を整える", () => {
    expect(sanitizeSubject("　ご利用　１２，３４５円　")).toBe("ご利用 [AMOUNT]");
  });
  it("同じ会社の同じ種類のメールは 1 つのテンプレートにまとまる", () => {
    const a = sanitizeSubject("【カード】2026年8月のご利用明細（12,300円）");
    const b = sanitizeSubject("【カード】2026年9月のご利用明細（45,000円）");
    expect(a).toBe(b);
    expect(a).toBe("【カード】[DATE]のご利用明細（[AMOUNT]）");
  });
  it("件名が無い場合", () => {
    expect(sanitizeSubject(null)).toBe("（件名なし）");
    expect(sanitizeSubject("")).toBe("（件名なし）");
  });
});

describe("parseFromHeader", () => {
  it("表示名とアドレスを分ける", () => {
    expect(parseFromHeader('"Card Co" <Info@Example.Test>')).toEqual({
      name: "Card Co",
      address: "info@example.test",
    });
    expect(parseFromHeader("info@example.test")).toEqual({ name: "", address: "info@example.test" });
    expect(parseFromHeader(null)).toEqual({ name: "", address: "（不明）" });
  });
});

describe("aggregateCandidates", () => {
  it("From 別・件名テンプレート別に数え、最新／最古を出す", () => {
    const agg = aggregateCandidates([
      { from: "A <a@example.test>", subject: "ご利用明細 2026年8月", internalDate: "1756000000000" },
      { from: "A <a@example.test>", subject: "ご利用明細 2026年9月", internalDate: "1758000000000" },
      { from: "B <b@example.test>", subject: "キャンペーンのお知らせ", internalDate: "1757000000000" },
    ]);
    expect(agg.candidateCount).toBe(3);
    expect(agg.fromCounts).toEqual([
      { address: "a@example.test", name: "A", count: 2 },
      { address: "b@example.test", name: "B", count: 1 },
    ]);
    expect(agg.subjectTemplates).toEqual([
      { template: "ご利用明細 [DATE]", count: 2 },
      { template: "キャンペーンのお知らせ", count: 1 },
    ]);
    expect(agg.latestAt).toBe(new Date(1758000000000).toISOString());
    expect(agg.oldestAt).toBe(new Date(1756000000000).toISOString());
  });
  it("候補が無ければ空", () => {
    expect(aggregateCandidates([])).toEqual({
      candidateCount: 0,
      fromCounts: [],
      subjectTemplates: [],
      latestAt: null,
      oldestAt: null,
    });
  });
});
