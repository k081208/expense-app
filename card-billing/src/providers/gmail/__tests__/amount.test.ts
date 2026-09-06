import { describe, expect, it } from "vitest";
import { extractAmount, firstAmountIn } from "../extract/amount";
import { normalizeText } from "../extract/text";

const LABELS = [/ご請求(?:予定)?金額/, /お支払い?金額/];
const EXCLUDE = [/ポイント/, /利用可能/, /前回/];

const run = (body: string) => extractAmount(normalizeText(body), LABELS, EXCLUDE);

describe("extractAmount", () => {
  it("ラベルの直後の金額を取る（本文で最初に出てくる円は取らない）", () => {
    const r = run(`ご利用可能額 500,000円
今月もご利用ありがとうございます。手数料 330円の例もあります。
ご請求金額 12,345円
獲得ポイント 123ポイント`);
    expect(r.status).toBe("ok");
    expect(r.amount).toBe(12345);
  });
  it("「¥」表記・全角・空白入りも同じ値になる", () => {
    expect(run("ご請求金額：￥１２，３４５").amount).toBe(12345);
    expect(run("ご請求金額 12,345 円").amount).toBe(12345);
    expect(run("お支払金額 12345円").amount).toBe(12345);
  });
  it("0 円は正常な金額（amount = 0）", () => {
    const r = run("ご請求金額 0円");
    expect(r).toMatchObject({ status: "ok", amount: 0 });
  });
  it("ラベルの行に値が無く次の行にあるときは次の行を見る", () => {
    expect(run("ご請求金額：\n12,345円").amount).toBe(12345);
    expect(run("ご請求金額\n\n12,345円").amount).toBe(12345);
  });
  it("除外語（ポイント・利用可能・前回）の行は候補にしない", () => {
    const r = run(`前回のご請求金額 99,999円
ご利用可能なご請求金額枠 500,000円
ご請求金額 12,345円`);
    expect(r.amount).toBe(12345);
    expect(r.candidates).toHaveLength(1);
  });
  it("優先順位の低いラベルより高いラベルを使う", () => {
    const r = run(`お支払い金額 1,000円
ご請求金額 2,000円`);
    expect(r.amount).toBe(2000);
  });
  it("同じ最優先ラベルに同じ値が繰り返されるのは問題ない", () => {
    const r = run(`ご請求金額 12,345円
（内訳）
ご請求金額 12,345円`);
    expect(r).toMatchObject({ status: "ok", amount: 12345 });
  });
  it("同じ最優先ラベルに異なる値があれば決めない（ambiguous）", () => {
    const r = run(`ご請求金額 12,345円
ご請求金額 20,000円`);
    expect(r.status).toBe("ambiguous");
    expect(r.amount).toBeNull();
  });
  it("ラベルはあるが金額が続かなければ none", () => {
    const r = run("ご請求金額は以下のとおりです。\n明細をご確認ください。");
    expect(r.status).toBe("none");
    expect(r.notes.some((n) => n.includes("金額なし"))).toBe(true);
  });
  it("ラベルが無ければ none", () => {
    const r = run("本日のご利用 3,000円");
    expect(r.status).toBe("none");
    expect(r.amount).toBeNull();
  });
  it("抽出過程のメモに生の数字を残さない", () => {
    const r = run("ご請求金額は 12,345 の予定です");
    expect(r.notes.join("\n")).not.toContain("12,345");
    expect(r.notes.join("\n")).toContain("##,###");
  });
});

describe("firstAmountIn", () => {
  it("日付の数字を金額と間違えない", () => {
    expect(firstAmountIn("2026年9月27日")).toBeNull();
    expect(firstAmountIn("9/27 にお支払い 1,200円")).toBe(1200);
  });
});
