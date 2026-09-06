import { describe, expect, it } from "vitest";
import { describeLastFourCandidates, extractLastFourCandidates } from "../extract/last-four";
import { normalizeText } from "../extract/text";

const run = (body: string) => extractLastFourCandidates(normalizeText(body));

describe("extractLastFourCandidates", () => {
  it("「下4桁」「末尾」「****-1234」の形から下 4 桁だけを取り出す", () => {
    expect(run("カード番号 下4桁: 1234")).toEqual(["1234"]);
    expect(run("カード番号（下４桁）１２３４")).toEqual(["1234"]);
    expect(run("カード末尾 5678 のご利用")).toEqual(["5678"]);
    expect(run("****-****-****-4321")).toEqual(["4321"]);
    expect(run("**** **** **** 4321")).toEqual(["4321"]);
    expect(run("XXXX-XXXX-XXXX-8765")).toEqual(["8765"]);
    expect(run("カード番号 ************1111")).toEqual(["1111"]);
  });
  it("複数あれば出てきた順に重複なく返す", () => {
    expect(run("下4桁 1234 と 末尾 5678、再度 下4桁 1234")).toEqual(["1234", "5678"]);
  });
  it("金額・日付・会員番号を下 4 桁と間違えない", () => {
    expect(run("ご請求金額 12,345円 お支払い日 2026年9月27日 会員番号 1234-5678-9012")).toEqual([]);
    expect(run("下4桁 12345")).toEqual([]);
  });
  it("16 桁の番号そのものは取り出さない", () => {
    expect(run("4111 1111 1111 1111")).toEqual([]);
  });
  it("何も無ければ空配列", () => {
    expect(run("ありがとうございます")).toEqual([]);
  });
});

describe("describeLastFourCandidates", () => {
  it("画面向けの説明には末尾 2 桁だけを含める", () => {
    expect(describeLastFourCandidates(["1234"])).toBe("本文の下4桁候補 1 件（••34）");
    expect(describeLastFourCandidates([])).toBe("本文に下4桁の記載なし");
  });
});
