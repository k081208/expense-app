import { describe, expect, it } from "vitest";
import { classifySubject } from "../extract/subject";
import { normalizeSubject, normalizeText } from "../extract/text";

const RULES = {
  changed: [/内容変更のご案内/],
  confirmed: [/ご請求金額のご案内/, /内容確定のご案内/],
  provisional: [/ご請求予定金額のご案内/],
  paymentNotice: [/お引き落とし日のご案内/],
};

describe("classifySubject", () => {
  it("確定・予定・引き落とし・変更を件名から分類する", () => {
    expect(classifySubject("【サンプル】カードご請求金額のご案内", RULES)).toBe("confirmed");
    expect(classifySubject("【サンプル】ご請求予定金額のご案内", RULES)).toBe("provisional");
    expect(classifySubject("【重要】お引き落とし日のご案内【サンプル】(カード名)", RULES)).toBe("payment_notice");
    expect(classifySubject("サンプルカード2026年9月分お振替内容確定のご案内", RULES)).toBe("confirmed");
    expect(classifySubject("サンプルカード2026年9月分お振替内容変更のご案内", RULES)).toBe("changed");
  });
  it("利用速報・キャンペーンなどは対象外", () => {
    expect(classifySubject("カード利用のお知らせ(本人ご利用分)", RULES)).toBe("irrelevant");
    expect(classifySubject("【速報版】カード利用のお知らせ", RULES)).toBe("irrelevant");
    expect(classifySubject("ポイント5倍キャンペーン", RULES)).toBe("irrelevant");
    expect(classifySubject(null, RULES)).toBe("irrelevant");
    expect(classifySubject("", RULES)).toBe("irrelevant");
  });
  it("全角の数字・記号・改行を含む件名でも分類できる", () => {
    expect(classifySubject("【サンプル】\r\n ご請求金額のご案内　２０２６年９月", RULES)).toBe("confirmed");
  });
});

describe("normalizeText / normalizeSubject", () => {
  it("全角の数字・英字・記号を半角にし、行ごとの空白を整える", () => {
    expect(normalizeText("ご請求金額：　１２，３４５円\r\n\r\n\r\nＪＣＢ　カード  ")).toBe(
      "ご請求金額: 12,345円\n\nJCB カード",
    );
    expect(normalizeSubject("ａ\nｂ")).toBe("a b");
  });
  it("括弧・波線などは壊さない（NFKC は使わない）", () => {
    expect(normalizeText("楽天カード（Ｖｉｓａ）〜")).toBe("楽天カード(Visa)〜");
  });
});
