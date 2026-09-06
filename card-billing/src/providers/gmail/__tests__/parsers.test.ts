import { describe, expect, it } from "vitest";
import { extractBodyText } from "../mime";
import { amexGmailParser } from "../parsers/amex";
import { aupayGmailParser, edionGmailParser } from "../parsers/candidates";
import { jaccsGmailParser } from "../parsers/jaccs";
import { jcbGmailParser } from "../parsers/jcb";
import { paypayGmailParser } from "../parsers/paypay";
import { rakutenGmailParser } from "../parsers/rakuten";
import type { GmailBillingParser, GmailParseInput } from "../types";

/**
 * 各 Parser の解析テスト。
 *
 * 本文はすべて **架空** のもの（実メールの文面・金額・下 4 桁・会員名は使っていない）。
 * 実メールで確認したのは送信元と件名の形だけで、本文の形はこのテストの想定である。
 * 実 Google 環境での確認結果に応じて、規則とこの fixture を合わせて調整する。
 */

const RECEIVED = "2026-09-12T03:00:00.000Z";
const CARD_A = { id: "card-a", displayName: "カード A", lastFour: "1234" };
const CARD_B = { id: "card-b", displayName: "カード B", lastFour: "5678" };
const SINGLE = { id: "card-s", displayName: "カード S", lastFour: null };

const input = (over: Partial<GmailParseInput>): GmailParseInput => ({
  from: null,
  subject: null,
  receivedAt: RECEIVED,
  bodyText: null,
  bodyStatus: "ok",
  ...over,
});

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const bodyFromHtml = (html: string) => {
  const r = extractBodyText({ mimeType: "text/html", body: { size: 1, data: b64(html) } });
  return r.status === "ok" ? r.text : null;
};

// ---------------------------------------------------------------------------
// 楽天カード
// ---------------------------------------------------------------------------
describe("rakuten parser", () => {
  const FROM = '"楽天カード" <info@mail.rakuten-card.co.jp>';
  const CONFIRMED = "【楽天カード】カードご請求金額のご案内";
  const body = (lastFour: string, extra = "") => `いつも楽天カードをご利用いただきありがとうございます。

■カード種類 楽天カード(Mastercard)
■カード番号 下4桁 ${lastFour}
■ご請求金額 12,345円
■お支払い日 2026年9月27日
■獲得予定ポイント 123ポイント
■ご利用可能額 500,000円
${extra}`;

  it("正常: 金額・支払日・カード（下 4 桁）を読み取る", () => {
    const r = rakutenGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText: body("1234") }), [CARD_A, CARD_B]);
    expect(r).toMatchObject({
      status: "success",
      errorCode: null,
      mailClass: "confirmed",
      isProvisional: false,
      cardId: "card-a",
      matchedBy: "last_four",
      amount: 12345,
      paymentDate: "2026-09-27",
      sourceReceivedAt: RECEIVED,
    });
  });
  it("2 枚目のカードの下 4 桁なら 2 枚目に結びつく", () => {
    const r = rakutenGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText: body("5678") }), [CARD_A, CARD_B]);
    expect(r.cardId).toBe("card-b");
  });
  it("予定金額の案内は暫定（isProvisional）。年の無い日付は受信日時から補う", () => {
    const r = rakutenGmailParser.parse(
      input({
        from: FROM,
        subject: "【楽天カード】ご請求予定金額のご案内",
        bodyText: "■カード番号 下4桁 1234\n■ご請求予定金額 6,789円\n■お支払い予定日 9月27日",
      }),
      [CARD_A, CARD_B],
    );
    expect(r).toMatchObject({ status: "success", mailClass: "provisional", isProvisional: true, amount: 6789, paymentDate: "2026-09-27" });
  });
  it("引き落とし日の案内は金額が無くても支払日だけで成功する", () => {
    const r = rakutenGmailParser.parse(
      input({
        from: FROM,
        subject: "【重要】お引き落とし日のご案内【楽天カード株式会社】(楽天カード（Visa）)",
        bodyText: "下4桁 1234 のカードのお引き落とし日は 2026年9月27日 です。",
      }),
      [CARD_A, CARD_B],
    );
    expect(r).toMatchObject({ status: "success", mailClass: "payment_notice", amount: null, paymentDate: "2026-09-27", cardId: "card-a" });
  });
  it("金額なし → amount_parse_failed", () => {
    const r = rakutenGmailParser.parse(
      input({ from: FROM, subject: CONFIRMED, bodyText: "■カード番号 下4桁 1234\n■お支払い日 2026年9月27日" }),
      [CARD_A, CARD_B],
    );
    expect(r).toMatchObject({ status: "error", errorCode: "amount_parse_failed", paymentDate: "2026-09-27" });
  });
  it("同じラベルに異なる金額が複数 → amount_ambiguous（最初の円を採用しない）", () => {
    const r = rakutenGmailParser.parse(
      input({ from: FROM, subject: CONFIRMED, bodyText: body("1234", "■ご請求金額 99,999円") }),
      [CARD_A, CARD_B],
    );
    expect(r).toMatchObject({ status: "error", errorCode: "amount_ambiguous", amount: null });
  });
  it("日付なし → payment_date_parse_failed", () => {
    const r = rakutenGmailParser.parse(
      input({ from: FROM, subject: CONFIRMED, bodyText: "■カード番号 下4桁 1234\n■ご請求金額 12,345円" }),
      [CARD_A, CARD_B],
    );
    expect(r).toMatchObject({ status: "error", errorCode: "payment_date_parse_failed", amount: 12345 });
  });
  it("不正な日付（2 月 30 日）→ payment_date_parse_failed", () => {
    const r = rakutenGmailParser.parse(
      input({ from: FROM, subject: CONFIRMED, bodyText: "■カード番号 下4桁 1234\n■ご請求金額 12,345円\n■お支払い日 2026年2月30日" }),
      [CARD_A, CARD_B],
    );
    expect(r).toMatchObject({ status: "error", errorCode: "payment_date_parse_failed", paymentDate: null });
  });
  it("From 不一致（似たドメイン・表示名偽装）→ sender_mismatch。件名が一致していても通らない", () => {
    for (const from of [
      '"楽天カード" <info@mail.rakuten-card.co.jp.example.test>',
      '"楽天カード" <info@mail-rakuten-card.co.jp>',
      '"info@mail.rakuten-card.co.jp" <someone@example.test>',
      "info@rakuten-card.co.jp",
    ]) {
      const r = rakutenGmailParser.parse(input({ from, subject: CONFIRMED, bodyText: body("1234") }), [CARD_A, CARD_B]);
      expect(r, from).toMatchObject({ status: "error", errorCode: "sender_mismatch", amount: null, cardId: null });
    }
  });
  it("Subject 不一致（利用速報）→ subject_mismatch。本文は読まない", () => {
    const r = rakutenGmailParser.parse(
      input({ from: FROM, subject: "カード利用のお知らせ(本人ご利用分)", bodyText: body("1234") }),
      [CARD_A, CARD_B],
    );
    expect(r).toMatchObject({ status: "error", errorCode: "subject_mismatch", mailClass: "irrelevant", amount: null });
  });
  it("本文なし → body_missing、文字化け → body_decode_failed", () => {
    expect(rakutenGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText: null, bodyStatus: "missing" }), [CARD_A])).toMatchObject({ errorCode: "body_missing" });
    expect(rakutenGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText: "   ", bodyStatus: "ok" }), [CARD_A])).toMatchObject({ errorCode: "body_missing" });
    expect(rakutenGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText: null, bodyStatus: "decode_failed" }), [CARD_A])).toMatchObject({ errorCode: "body_decode_failed" });
  });
  it("複数カードで本文に下 4 桁が無い → card_match_ambiguous（表示名では決めない）", () => {
    const r = rakutenGmailParser.parse(
      input({ from: FROM, subject: CONFIRMED, bodyText: "■カード種類 カード A\n■ご請求金額 12,345円\n■お支払い日 2026年9月27日" }),
      [CARD_A, CARD_B],
    );
    expect(r).toMatchObject({ status: "error", errorCode: "card_match_ambiguous", cardId: null, amount: 12345 });
  });
  it("複数カードで下 4 桁が未登録 → card_configuration_required", () => {
    const r = rakutenGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText: body("1234") }), [CARD_A, { ...CARD_B, lastFour: null }]);
    expect(r).toMatchObject({ status: "error", errorCode: "card_configuration_required" });
  });
  it("本文の下 4 桁がどの登録値とも一致しない（架空の下 4 桁のまま）→ card_configuration_required", () => {
    const r = rakutenGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText: body("9999") }), [CARD_A, CARD_B]);
    expect(r).toMatchObject({ status: "error", errorCode: "card_configuration_required" });
  });
  it("結果と抽出過程に本文・件名・下 4 桁の全桁を含めない", () => {
    const r = rakutenGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText: body("1234") }), [CARD_A, CARD_B]);
    const json = JSON.stringify({ ...r, cardLastFour: undefined });
    expect(json).not.toContain("ありがとうございます");
    expect(json).not.toContain(CONFIRMED);
    expect(json).not.toContain("info@mail");
    expect(r.debug.join("\n")).not.toMatch(/(?<!\d)1234(?!\d)/);
  });
});

// ---------------------------------------------------------------------------
// JCB
// ---------------------------------------------------------------------------
describe("jcb parser", () => {
  const FROM = "MyJCB <mail@qa.jcb.co.jp>";
  const FROM2 = "<mail@cj.jcb.co.jp>";
  const CONFIRMED = "JCBカード2026年9月分お振替内容確定のご案内";
  const CHANGED = "JCBカード2026年9月分お振替内容変更のご案内";

  it("確定: 2 枚のうち本文の下 4 桁で決める", () => {
    const bodyText = `JCBカードのお振替内容が確定しました。
カード番号 ****-****-****-5678
お振替日 2026年9月10日
お振替金額 45,678円`;
    const r = jcbGmailParser.parse(input({ from: FROM, subject: CONFIRMED, bodyText }), [CARD_A, CARD_B]);
    expect(r).toMatchObject({ status: "success", mailClass: "confirmed", cardId: "card-b", amount: 45678, paymentDate: "2026-09-10" });
  });
  it("変更: 「変更前」の金額は除外し「変更後」を採用する。2 つ目の送信元も許可", () => {
    const bodyText = `お振替内容に変更がありました。
カード番号 ****-****-****-1234
変更前のお振替金額 45,678円
変更後のお振替金額 40,000円
お振替日 2026年9月10日`;
    const r = jcbGmailParser.parse(input({ from: FROM2, subject: CHANGED, bodyText, receivedAt: "2026-09-05T00:00:00.000Z" }), [CARD_A, CARD_B]);
    expect(r).toMatchObject({ status: "success", mailClass: "changed", isProvisional: false, cardId: "card-a", amount: 40000, paymentDate: "2026-09-10" });
  });
  it("送信元がドメインだけ同じ別アドレスなら通らない", () => {
    const r = jcbGmailParser.parse(input({ from: "<other@qa.jcb.co.jp>", subject: CONFIRMED, bodyText: "お振替金額 1円\nお振替日 2026年9月10日" }), [CARD_A]);
    expect(r.errorCode).toBe("sender_mismatch");
  });
});

// ---------------------------------------------------------------------------
// PayPay カード
// ---------------------------------------------------------------------------
describe("paypay parser", () => {
  const FROM = "PayPayカード <paypaycard-info@mail.paypay-card.co.jp>";

  it("確定: 請求金額と支払日", () => {
    const bodyText = "9月のご請求金額が確定しました。\nご請求金額 23,456円\nお支払い日 2026年9月27日\n付与予定ポイント 234ポイント";
    const r = paypayGmailParser.parse(input({ from: FROM, subject: "9月の請求金額のお知らせ", bodyText }), [SINGLE]);
    expect(r).toMatchObject({ status: "success", mailClass: "confirmed", cardId: "card-s", matchedBy: "single_card", amount: 23456, paymentDate: "2026-09-27" });
  });
  it("予定: 暫定として扱う", () => {
    const r = paypayGmailParser.parse(
      input({ from: FROM, subject: "10月の請求予定金額のお知らせ", bodyText: "ご請求予定金額 1,000円\nお支払い予定日 2026年10月27日" }),
      [SINGLE],
    );
    expect(r).toMatchObject({ status: "success", mailClass: "provisional", isProvisional: true, amount: 1000, paymentDate: "2026-10-27" });
  });
  it("引き落とし案内: 本文に日付が無ければ件名の日付を使う（年は受信日時から）", () => {
    const r = paypayGmailParser.parse(
      input({ from: FROM, subject: "【ご確認ください】お引き落としは9月27日（土）です", bodyText: "お引き落とし口座の残高をご確認ください。\nご請求金額 23,456円" }),
      [SINGLE],
    );
    expect(r).toMatchObject({ status: "success", mailClass: "payment_notice", amount: 23456, paymentDate: "2026-09-27" });
  });
  it("同じ送信元からの宣伝メールは件名で対象外", () => {
    const r = paypayGmailParser.parse(input({ from: FROM, subject: "今だけポイント還元キャンペーン", bodyText: "ご請求金額 1円" }), [SINGLE]);
    expect(r.errorCode).toBe("subject_mismatch");
  });
  it("0 円の請求は amount = 0 で成功", () => {
    const r = paypayGmailParser.parse(input({ from: FROM, subject: "9月の請求金額のお知らせ", bodyText: "ご請求金額 0円\nお支払い日 2026年9月27日" }), [SINGLE]);
    expect(r).toMatchObject({ status: "success", amount: 0 });
  });
});

// ---------------------------------------------------------------------------
// アメリカン・エキスプレス
// ---------------------------------------------------------------------------
describe("amex parser", () => {
  const FROM = "American Express <americanexpress@welcome.americanexpress.com>";
  const SUBJECT = "[AMERICAN EXPRESS] ご請求金額確定のご案内";

  it("HTML のみのメールでも文字列処理でテキスト化して読み取る（script は実行も残存もしない）", () => {
    const bodyText = bodyFromHtml(`<html><head><style>td{padding:4px}</style><script>window.alert("x")</script></head>
<body><table>
<tr><td>カード</td><td>サンプル・カード（末尾 1234）</td></tr>
<tr><td>ご請求金額</td><td>&yen;98,765</td></tr>
<tr><td>お支払い期日</td><td>2026年10月5日</td></tr>
<tr><td>ご利用可能残高</td><td>&yen;1,000,000</td></tr>
</table></body></html>`);
    expect(bodyText).not.toBeNull();
    expect(bodyText).not.toContain("alert");
    const r = amexGmailParser.parse(input({ from: FROM, subject: SUBJECT, bodyText }), [CARD_A]);
    expect(r).toMatchObject({ status: "success", cardId: "card-a", matchedBy: "last_four", amount: 98765, paymentDate: "2026-10-05" });
  });
  it("text/plain でも同じ", () => {
    const r = amexGmailParser.parse(input({ from: "<americanexpress@email.americanexpress.com>", subject: SUBJECT, bodyText: "ご請求金額 ¥98,765\nお支払い期日 2026年10月5日" }), [CARD_A]);
    expect(r).toMatchObject({ status: "success", amount: 98765, paymentDate: "2026-10-05" });
  });
  it("アンケート用の送信元は許可しない", () => {
    const r = amexGmailParser.parse(input({ from: "<americanexpress@feedbackemail.americanexpress.com>", subject: SUBJECT, bodyText: "ご請求金額 ¥1" }), [CARD_A]);
    expect(r.errorCode).toBe("sender_mismatch");
  });
  it("次回口座振替のお知らせは引き落とし案内", () => {
    const r = amexGmailParser.parse(input({ from: FROM, subject: "次回口座振替のお知らせ", bodyText: "口座振替日 2026年10月5日\n口座振替金額 ¥98,765" }), [CARD_A]);
    expect(r).toMatchObject({ status: "success", mailClass: "payment_notice", amount: 98765, paymentDate: "2026-10-05" });
  });
});

// ---------------------------------------------------------------------------
// JACCS
// ---------------------------------------------------------------------------
describe("jaccs parser", () => {
  const FROM = "JACCS <jaccs3@jaccs.co.jp>";
  const SUBJECT = "<JACCS>2026年9月度お支払い金額確定のご案内";

  it("確定: お支払い金額とお支払い日", () => {
    const r = jaccsGmailParser.parse(input({ from: FROM, subject: SUBJECT, bodyText: "2026年9月度のお支払い金額が確定しました。\nお支払い金額 33,000円\nお支払い日 2026年9月27日" }), [SINGLE]);
    expect(r).toMatchObject({ status: "success", mailClass: "confirmed", amount: 33000, paymentDate: "2026-09-27", cardId: "card-s" });
  });
  it("ラベルの次の行に値があっても読み取る", () => {
    const r = jaccsGmailParser.parse(input({ from: FROM, subject: SUBJECT, bodyText: "お支払い金額\n33,000円\nお支払い日\n2026年9月27日" }), [SINGLE]);
    expect(r).toMatchObject({ status: "success", amount: 33000, paymentDate: "2026-09-27" });
  });
  it("観測した別の送信元アドレスも完全一致なら通る", () => {
    const r = jaccsGmailParser.parse(input({ from: "<jaccs2@jaccs.co.jp>", subject: SUBJECT, bodyText: "お支払い金額 1円\nお支払い日 2026年9月27日" }), [SINGLE]);
    expect(r.status).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// 未対応（Tier B / C）
// ---------------------------------------------------------------------------
describe("unsupported parsers", () => {
  it("未対応の会社は常に provider_unsupported で、検索条件も作れない", () => {
    for (const p of [edionGmailParser, aupayGmailParser] as GmailBillingParser[]) {
      expect(p.support.level).toBe("unsupported");
      const r = p.parse(input({ from: "<x@example.test>", subject: "ご請求", bodyText: "ご請求金額 1円" }), [SINGLE]);
      expect(r).toMatchObject({ status: "error", errorCode: "provider_unsupported" });
      expect(() => p.buildQuery(120)).toThrow();
    }
  });
});
