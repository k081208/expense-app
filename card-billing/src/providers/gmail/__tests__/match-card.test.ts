import { describe, expect, it } from "vitest";
import { matchCard } from "../match-card";

const A = { id: "card-a", displayName: "カード A", lastFour: "1234" };
const B = { id: "card-b", displayName: "カード B", lastFour: "5678" };

describe("matchCard — 同じ会社のカードが 1 枚", () => {
  it("本文に下 4 桁が無ければ割り当てだけで決める", () => {
    expect(matchCard([A], [])).toEqual({ status: "matched", card: A, matchedBy: "single_card" });
  });
  it("下 4 桁が未登録でも 1 枚なら割り当てで決める", () => {
    const none = { ...A, lastFour: null };
    expect(matchCard([none], ["1234"])).toEqual({ status: "matched", card: none, matchedBy: "single_card" });
  });
  it("本文の下 4 桁が登録値と一致すれば下 4 桁で確定", () => {
    expect(matchCard([A], ["1234"])).toEqual({ status: "matched", card: A, matchedBy: "last_four" });
  });
  it("本文の下 4 桁が登録値と食い違えば結びつけない（設定の見直し）", () => {
    const r = matchCard([A], ["9999"]);
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.code).toBe("card_configuration_required");
  });
});

describe("matchCard — 同じ会社のカードが 2 枚", () => {
  it("本文の下 4 桁が A に一致 → A", () => {
    expect(matchCard([A, B], ["1234"])).toEqual({ status: "matched", card: A, matchedBy: "last_four" });
  });
  it("本文の下 4 桁が B に一致 → B", () => {
    expect(matchCard([A, B], ["5678"])).toEqual({ status: "matched", card: B, matchedBy: "last_four" });
  });
  it("どちらにも一致しない → card_configuration_required（登録値が架空・未更新の可能性）", () => {
    const r = matchCard([A, B], ["9999"]);
    expect(r).toMatchObject({ status: "error", code: "card_configuration_required" });
  });
  it("本文に下 4 桁が無い → card_match_ambiguous", () => {
    expect(matchCard([A, B], [])).toMatchObject({ status: "error", code: "card_match_ambiguous" });
  });
  it("両方に一致してしまう → card_match_ambiguous", () => {
    expect(matchCard([A, B], ["1234", "5678"])).toMatchObject({ status: "error", code: "card_match_ambiguous" });
  });
  it("いずれかのカードに下 4 桁が未登録 → card_configuration_required（表示名では決めない）", () => {
    const r = matchCard([A, { ...B, lastFour: null }], ["1234"]);
    expect(r).toMatchObject({ status: "error", code: "card_configuration_required" });
    if (r.status === "error") expect(r.detail).toContain("カード B");
  });
  it("説明文に下 4 桁の全桁を含めない", () => {
    const r = matchCard([A, B], ["9999"]);
    if (r.status === "error") expect(r.detail).not.toMatch(/\d{4}/);
  });
});

describe("matchCard — カード無し", () => {
  it("対象カードが無ければ設定エラー", () => {
    expect(matchCard([], ["1234"])).toMatchObject({ status: "error", code: "card_configuration_required" });
  });
});
