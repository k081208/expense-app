import { createGmailParser } from "../parse";
import type { GmailProviderRule } from "../types";

/**
 * PayPay カード（Tier A・正式）
 *
 * 実メール探索で確認した事実:
 *   - 送信元: paypaycard-info@mail.paypay-card.co.jp（請求・予定・引き落とし・宣伝のすべて）
 *   - 確定:   「M月の請求金額のお知らせ」
 *   - 予定:   「M月の請求予定金額のお知らせ」
 *   - 引落:   「【ご確認ください】お引き落としはM月D日（曜日）です」
 *   - 対象外: 同じ送信元からの宣伝メール（件名で除外）
 *
 * 引き落とし案内は件名に日付があるため、本文で見つからないときは件名の日付を使う。
 */
export const paypayGmailRule: GmailProviderRule = {
  providerKey: "paypay",
  support: { level: "official" },
  senderAllowlist: ["paypaycard-info@mail.paypay-card.co.jp"],
  subject: {
    confirmed: [/の請求金額のお知らせ/],
    provisional: [/請求予定金額のお知らせ/],
    paymentNotice: [/お引き?落としは.+です/],
  },
  searchSubjects: ["請求金額のお知らせ", "請求予定金額のお知らせ", "お引き落としは"],
  amountLabels: [/ご?請求(?:予定)?金額/, /お支払い?(?:予定)?金額/, /請求額/],
  amountExclude: [/ポイント/, /利用可能/, /前回/, /手数料/, /キャンペーン/, /付与/],
  dateLabels: [/お支払い?(?:予定)?日/, /お引き?落とし(?:予定)?日/, /引落(?:予定)?日/, /振替日/],
  dateExclude: [/締め?日/, /ご利用日/],
  dateFromSubject: true,
};

export const paypayGmailParser = createGmailParser(paypayGmailRule);
