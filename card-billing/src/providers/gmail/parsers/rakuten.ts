import { createGmailParser } from "../parse";
import type { GmailProviderRule } from "../types";

/**
 * 楽天カード（Tier A・正式）
 *
 * STEP 8A の実メール探索で確認した事実だけを規則にしている:
 *   - 送信元: info@mail.rakuten-card.co.jp（請求・予定・引き落とし案内のすべて）
 *   - 確定:   「【楽天カード】カードご請求金額のご案内」（月 2 回程度）
 *   - 予定:   「【楽天カード】ご請求予定金額のご案内」「【楽天カード】お支払予定金額のご案内」
 *   - 引落:   「【重要】お引き落とし日のご案内【楽天カード株式会社】(カード名)」
 *   - 対象外: 「カード利用のお知らせ」「【速報版】…」（利用速報。件数が多い）
 *
 * 同じ Gmail に楽天カードが 2 枚届くため、カードの特定は本文の下 4 桁で行う。
 * 件名のカード名（PINK / プレミアム）は識別キーにしない。
 */
export const rakutenGmailRule: GmailProviderRule = {
  providerKey: "rakuten",
  support: { level: "official" },
  senderAllowlist: ["info@mail.rakuten-card.co.jp"],
  subject: {
    confirmed: [/カードご請求金額のご案内/],
    provisional: [/ご請求予定金額のご案内/, /お支払予定金額のご案内/],
    paymentNotice: [/お引き落とし日のご案内/],
  },
  searchSubjects: [
    "カードご請求金額のご案内",
    "ご請求予定金額のご案内",
    "お支払予定金額のご案内",
    "お引き落とし日のご案内",
  ],
  amountLabels: [/ご請求(?:予定)?金額/, /お支払い?(?:予定)?金額/, /請求金額/],
  amountExclude: [/ポイント/, /利用可能/, /前回/, /手数料/, /キャンペーン/, /楽天市場/, /獲得/],
  dateLabels: [/お支払い?(?:予定)?日/, /お引き?落とし(?:予定)?日/, /引落(?:予定)?日/, /口座振替日/, /振替日/],
  dateExclude: [/締め?日/, /ご利用日/, /変更/],
  dateFromSubject: false,
};

export const rakutenGmailParser = createGmailParser(rakutenGmailRule);
