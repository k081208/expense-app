import { describe, expect, it } from "vitest";
import { selectCurrentBilling, selectCurrentBillingByCard } from "../select";
import type { GmailMailClass, ParsedGmailBilling } from "../types";

const rec = (over: Partial<ParsedGmailBilling> & { mailClass: GmailMailClass }): ParsedGmailBilling => ({
  providerKey: "jcb",
  cardId: "card-a",
  cardDisplayName: "カード A",
  cardLastFour: "1234",
  matchedBy: "last_four",
  amount: 1000,
  paymentDate: "2026-09-10",
  isProvisional: over.mailClass === "provisional",
  status: "success",
  errorCode: null,
  sourceReceivedAt: "2026-09-01T00:00:00.000Z",
  debug: [],
  ...over,
});

const AS_OF = new Date("2026-09-05T00:00:00Z");

describe("selectCurrentBilling", () => {
  it("同じ支払日なら「変更」が「確定」より優先される（JCB）", () => {
    const confirmed = rec({ mailClass: "confirmed", amount: 45678, sourceReceivedAt: "2026-09-01T00:00:00.000Z" });
    const changed = rec({ mailClass: "changed", amount: 40000, sourceReceivedAt: "2026-09-03T00:00:00.000Z" });
    expect(selectCurrentBilling([confirmed, changed], AS_OF)?.amount).toBe(40000);
    expect(selectCurrentBilling([changed, confirmed], AS_OF)?.amount).toBe(40000);
  });
  it("同じ種類なら受信日時が新しい方", () => {
    const older = rec({ mailClass: "confirmed", amount: 1, sourceReceivedAt: "2026-09-01T00:00:00.000Z" });
    const newer = rec({ mailClass: "confirmed", amount: 2, sourceReceivedAt: "2026-09-02T00:00:00.000Z" });
    expect(selectCurrentBilling([older, newer], AS_OF)?.amount).toBe(2);
  });
  it("基準日以降の支払日があれば、その中で最も近いもの（先の月の予定より今月の確定）", () => {
    const thisMonth = rec({ mailClass: "confirmed", amount: 10, paymentDate: "2026-09-27" });
    const nextMonth = rec({ mailClass: "provisional", amount: 20, paymentDate: "2026-10-27", sourceReceivedAt: "2026-09-04T00:00:00.000Z" });
    const past = rec({ mailClass: "confirmed", amount: 5, paymentDate: "2026-08-27" });
    expect(selectCurrentBilling([past, nextMonth, thisMonth], AS_OF)?.amount).toBe(10);
  });
  it("基準日以降の支払日が無ければ最も新しい支払日", () => {
    const a = rec({ mailClass: "confirmed", amount: 1, paymentDate: "2026-07-27" });
    const b = rec({ mailClass: "confirmed", amount: 2, paymentDate: "2026-08-27" });
    expect(selectCurrentBilling([a, b], AS_OF)?.amount).toBe(2);
  });
  it("引き落とし案内（金額なし）は同じ支払日の確定より優先されない", () => {
    const confirmed = rec({ mailClass: "confirmed", amount: 10, paymentDate: "2026-09-27" });
    const notice = rec({ mailClass: "payment_notice", amount: null, paymentDate: "2026-09-27", sourceReceivedAt: "2026-09-04T00:00:00.000Z" });
    expect(selectCurrentBilling([notice, confirmed], AS_OF)?.amount).toBe(10);
  });
  it("失敗した結果・カード未特定の結果は候補にしない", () => {
    const failed = rec({ mailClass: "confirmed", status: "error", errorCode: "amount_parse_failed", amount: null });
    const noCard = rec({ mailClass: "confirmed", cardId: null });
    expect(selectCurrentBilling([failed, noCard], AS_OF)).toBeNull();
  });
});

describe("selectCurrentBillingByCard", () => {
  it("カードごとに別々に選ぶ", () => {
    const a = rec({ mailClass: "confirmed", cardId: "card-a", amount: 1 });
    const b1 = rec({ mailClass: "confirmed", cardId: "card-b", amount: 2 });
    const b2 = rec({ mailClass: "changed", cardId: "card-b", amount: 3, sourceReceivedAt: "2026-09-02T00:00:00.000Z" });
    const m = selectCurrentBillingByCard([a, b1, b2], AS_OF);
    expect(m.get("card-a")?.amount).toBe(1);
    expect(m.get("card-b")?.amount).toBe(3);
  });
});
