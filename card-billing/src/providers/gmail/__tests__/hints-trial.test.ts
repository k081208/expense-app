import { describe, expect, it } from "vitest";
import { collectStructureHints } from "../extract/hints";
import { normalizeText } from "../extract/text";
import { aeonGmailParser, aupayGmailParser, edionGmailParser, saisonGmailParser } from "../parsers/candidates";
import { rakutenGmailParser } from "../parsers/rakuten";
import type { GmailParseInput } from "../types";

/**
 * STEP 8B.1: 実メールで失敗したときに本文の構造だけを出すヒントと、
 * 未対応の会社を開発画面で試すだけの「試行モード」のテスト。本文はすべて架空。
 */

const RECEIVED = "2026-09-12T03:00:00.000Z";
const CARD = { id: "card-s", displayName: "カード S", lastFour: null };
const input = (over: Partial<GmailParseInput>): GmailParseInput => ({
  from: null, subject: null, receivedAt: RECEIVED, bodyText: null, bodyStatus: "ok", ...over,
});

describe("collectStructureHints", () => {
  const text = normalizeText(`いつもご利用ありがとうございます。
今回ご請求額 12,345円
お振替予定日 2026年9月27日
カード番号 ****-****-****-1234
ポイント 100ポイント`);

  it("金額・日付・カード番号らしき行を、数字をマスクして返す", () => {
    const hints = collectStructureHints(text, ["amount", "date", "card"]);
    expect(hints).toEqual([
      "金額らしき行 行2: 「今回ご請求額 ##,###円」",
      "日付らしき行 行3: 「お振替予定日 ####年#月##日」",
      "カード番号らしき行 行4: 「カード番号 ****-****-****-####」",
    ]);
    expect(hints.join("\n")).not.toMatch(/\d{2,}/);
  });
  it("該当が無い種類は「なし」", () => {
    expect(collectStructureHints("こんにちは", ["amount"])).toEqual(["金額らしき行: なし"]);
  });
  it("種類ごとに 8 行まで", () => {
    const many = Array.from({ length: 20 }, (_, i) => `明細${i} 100円`).join("\n");
    expect(collectStructureHints(many, ["amount"])).toHaveLength(8);
  });
});

describe("失敗時の構造ヒント（Parser 経由）", () => {
  const FROM = '"楽天カード" <info@mail.rakuten-card.co.jp>';
  const SUBJECT = "【楽天カード】カードご請求金額のご案内";

  it("金額ラベルが想定と違うとき、抽出過程に金額らしき行がマスクされて出る", () => {
    const r = rakutenGmailParser.parse(
      input({ from: FROM, subject: SUBJECT, bodyText: "今回のご利用合計 12,345円\nお支払い日 2026年9月27日" }),
      [CARD],
    );
    expect(r.errorCode).toBe("amount_parse_failed");
    expect(r.debug).toContain("金額らしき行 行1: 「今回のご利用合計 ##,###円」");
    expect(r.debug.join("\n")).not.toContain("12,345");
    // 日付は取れているので日付のヒントは付かない
    expect(r.debug.some((d) => d.startsWith("日付らしき行"))).toBe(false);
  });
  it("成功したときはヒントを付けない", () => {
    const r = rakutenGmailParser.parse(
      input({ from: FROM, subject: SUBJECT, bodyText: "ご請求金額 12,345円\nお支払い日 2026年9月27日" }),
      [CARD],
    );
    expect(r.status).toBe("success");
    expect(r.debug.some((d) => d.includes("らしき行"))).toBe(false);
  });
});

describe("試行モード（未対応の会社）", () => {
  it("通常の parse は未対応のまま provider_unsupported", () => {
    const r = edionGmailParser.parse(
      input({ from: "<e-ask@orico.co.jp>", subject: "ご利用明細更新のお知らせ", bodyText: "ご請求金額 1,000円\nお支払い日 2026年9月27日" }),
      [CARD],
    );
    expect(r).toMatchObject({ status: "error", errorCode: "provider_unsupported", trial: false });
    expect(edionGmailParser.support.level).toBe("unsupported");
  });
  it("trial: true のときだけ観測済みの送信元・件名で解析し、結果に trial が付く", () => {
    const r = edionGmailParser.parse(
      input({ from: "<e-ask@orico.co.jp>", subject: "ご利用明細更新のお知らせ", bodyText: "ご請求金額 1,000円\nお支払い日 2026年9月27日" }),
      [CARD],
      { trial: true },
    );
    expect(r).toMatchObject({ status: "success", trial: true, amount: 1000, paymentDate: "2026-09-27" });
    expect(r.debug[0]).toContain("試行モード");
  });
  it("試行でも送信元・件名の検証は緩めない", () => {
    const bad = edionGmailParser.parse(
      input({ from: "<someone@orico.co.jp>", subject: "ご利用明細更新のお知らせ", bodyText: "ご請求金額 1円" }),
      [CARD],
      { trial: true },
    );
    expect(bad.errorCode).toBe("sender_mismatch");
    const promo = edionGmailParser.parse(
      input({ from: "<e-ask@orico.co.jp>", subject: "キャンペーンのお知らせ", bodyText: "ご請求金額 1円" }),
      [CARD],
      { trial: true },
    );
    expect(promo.errorCode).toBe("subject_mismatch");
  });
  it("Tier B は試行できるが、au PAY（実メール待ち）は試行もできない", () => {
    expect(edionGmailParser.canTrial).toBe(true);
    expect(aeonGmailParser.canTrial).toBe(true);
    expect(saisonGmailParser.canTrial).toBe(true);
    expect(aupayGmailParser.canTrial).toBe(false);
    const r = aupayGmailParser.parse(input({ from: "<x@example.test>", subject: "ご請求", bodyText: "ご請求金額 1円" }), [CARD], { trial: true });
    expect(r.errorCode).toBe("provider_unsupported");
    expect(() => aupayGmailParser.buildQuery(120)).toThrow();
  });
  it("試行の検索条件も from: と subject: で絞る", () => {
    expect(aeonGmailParser.buildQuery(120)).toBe(
      'from:statement@email.aeon.co.jp subject:"ご請求額のお知らせ" newer_than:120d -from:me',
    );
    expect(saisonGmailParser.buildQuery(120)).toContain("from:express@mail.saisoncard.co.jp");
    expect(edionGmailParser.buildQuery(120)).toContain("from:(e-ask@orico.co.jp OR e-service@orico.co.jp)");
  });
});
