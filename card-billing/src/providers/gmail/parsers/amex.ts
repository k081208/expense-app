import { createGmailParser } from "../parse";
import type { GmailProviderRule } from "../types";

/**
 * アメリカン・エキスプレス（Tier A・正式）
 *
 * 実メール探索で確認した事実:
 *   - 送信元: americanexpress@welcome.americanexpress.com（大半）
 *             americanexpress@email.americanexpress.com
 *             onlineservices@welcome.americanexpress.com
 *             （feedbackemail.americanexpress.com はアンケート用のため許可しない）
 *   - 確定:   「[AMERICAN EXPRESS] ご請求金額確定のご案内」
 *   - 引落:   「次回口座振替のお知らせ」（探索時の表記ゆれ「ご案内」も受け付ける）
 *
 * HTML 中心のメールのため、text/plain が無いときは HTML を文字列処理でテキスト化して使う。
 */
export const amexGmailRule: GmailProviderRule = {
  providerKey: "amex",
  support: { level: "official" },
  senderAllowlist: [
    "americanexpress@welcome.americanexpress.com",
    "americanexpress@email.americanexpress.com",
    "onlineservices@welcome.americanexpress.com",
  ],
  subject: {
    confirmed: [/ご請求金額確定のご案内/],
    paymentNotice: [/次回口座振替の(?:お知らせ|ご案内)/],
  },
  searchSubjects: ["ご請求金額確定のご案内", "次回口座振替のお知らせ"],
  amountLabels: [/ご請求金額/, /お支払い?金額/, /今回のご請求/, /口座振替(?:予定)?金額/],
  amountExclude: [/前回/, /ポイント/, /利用可能/, /ご利用限度/, /ご利用可能/],
  dateLabels: [
    /お支払い?(?:期限|期日|日)/,
    /口座振替(?:予定)?日/,
    /振替(?:予定)?日/,
    /お引き?落とし(?:予定)?日/,
  ],
  dateExclude: [/締め?日/, /ご利用日/],
};

export const amexGmailParser = createGmailParser(amexGmailRule);
