import { describe, expect, it } from "vitest";
import { extractPaymentDate, firstDateIn, inferYear, isValidYmd } from "../extract/date";
import { normalizeText } from "../extract/text";

const LABELS = [/お支払い?日/, /お引き落とし日/, /振替日/];
const RECEIVED = new Date("2026-09-12T03:00:00Z");

const run = (body: string, subject: string | null = null) =>
  extractPaymentDate(normalizeText(body), { labels: LABELS, receivedAt: RECEIVED, subjectFallback: subject });

describe("inferYear（純粋関数）", () => {
  it("受信日より少し後の月日には受信年を補う", () => {
    expect(inferYear(9, 27, RECEIVED)).toBe(2026);
    expect(inferYear(10, 5, RECEIVED)).toBe(2026);
  });
  it("年末に受信した 1 月の支払日は翌年になる", () => {
    expect(inferYear(1, 27, new Date("2026-12-15T00:00:00Z"))).toBe(2027);
  });
  it("受信日の直前（45 日以内）の日付は受信年のまま", () => {
    expect(inferYear(8, 27, RECEIVED)).toBe(2026);
  });
  it("受信日よりずっと前の月日は翌年と解釈する", () => {
    expect(inferYear(3, 27, RECEIVED)).toBe(2027);
  });
  it("JST の日付境界で受信年を決める（UTC 12/31 15:00 以降は JST 1/1）", () => {
    expect(inferYear(1, 27, new Date("2026-12-31T15:30:00Z"))).toBe(2027);
  });
});

describe("isValidYmd", () => {
  it("存在しない日付を弾く", () => {
    expect(isValidYmd(2026, 2, 30)).toBe(false);
    expect(isValidYmd(2026, 13, 1)).toBe(false);
    expect(isValidYmd(2026, 4, 31)).toBe(false);
    expect(isValidYmd(2028, 2, 29)).toBe(true);
    expect(isValidYmd(2026, 2, 29)).toBe(false);
  });
});

describe("firstDateIn", () => {
  it("年付き・年無し・区切り違いを YYYY-MM-DD にする", () => {
    expect(firstDateIn("2026年9月27日", RECEIVED)).toEqual({ status: "ok", date: "2026-09-27" });
    expect(firstDateIn("2026/9/27", RECEIVED)).toEqual({ status: "ok", date: "2026-09-27" });
    expect(firstDateIn("2026-10-05", RECEIVED)).toEqual({ status: "ok", date: "2026-10-05" });
    expect(firstDateIn("9月27日(土)", RECEIVED)).toEqual({ status: "ok", date: "2026-09-27" });
  });
  it("不正な日付は invalid、日付が無ければ none", () => {
    expect(firstDateIn("2026年2月30日", RECEIVED)).toEqual({ status: "invalid" });
    expect(firstDateIn("13月1日", RECEIVED)).toEqual({ status: "invalid" });
    expect(firstDateIn("12,345円", RECEIVED)).toEqual({ status: "none" });
  });
  it("「2026年9月分」は日付にしない", () => {
    expect(firstDateIn("2026年9月分のご請求", RECEIVED)).toEqual({ status: "none" });
  });
});

describe("extractPaymentDate", () => {
  it("ラベルの直後の日付を取り、他の日付（締め日など）は取らない", () => {
    const r = run(`ご利用日 2026年8月20日
締め日 8月31日
お支払い日 2026年9月27日`);
    expect(r).toMatchObject({ status: "ok", paymentDate: "2026-09-27", from: "body" });
  });
  it("年の無い日付は受信日時から補う", () => {
    expect(run("お支払日: 9月27日").paymentDate).toBe("2026-09-27");
    expect(run("お支払日: 1月27日").paymentDate).toBe("2027-01-27");
  });
  it("値が次の行にあるときは次の行を見る", () => {
    expect(run("お支払い日\n2026年9月27日").paymentDate).toBe("2026-09-27");
  });
  it("不正な日付は失敗（invalid）にする。payment_day から作ったりしない", () => {
    const r = run("お支払い日 2026年2月30日");
    expect(r.status).toBe("invalid");
    expect(r.paymentDate).toBeNull();
  });
  it("同じ最優先ラベルに異なる日付があれば決めない", () => {
    const r = run("お支払い日 2026年9月27日\nお支払い日 2026年10月27日");
    expect(r.status).toBe("ambiguous");
  });
  it("本文に無く、規則が許すときだけ件名の日付を使う", () => {
    const withSubject = run("お引き落としのご案内です。", "【ご確認ください】お引き落としは9月27日（土）です");
    expect(withSubject).toMatchObject({ status: "ok", paymentDate: "2026-09-27", from: "subject" });
    const without = run("お引き落としのご案内です。", null);
    expect(without.status).toBe("none");
  });
  it("メモに生の数字を残さない", () => {
    const r = run("お支払い日は 2026年2月30日 です");
    expect(r.notes.join("\n")).not.toContain("2026");
  });
});
