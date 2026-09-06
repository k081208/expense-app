import { createGmailParser } from "../parse";
import type { GmailProviderRule } from "../types";

/**
 * JACCS（Tier A・正式）
 *
 * 実メール探索で確認した事実:
 *   - 送信元: jaccs3@jaccs.co.jp（「お支払い金額確定のご案内」12 通／年、毎月 1 通）
 *             jaccs2@jaccs.co.jp / jaccs7@jaccs.co.jp からも案内が届く（内容未確認）
 *   - 確定:   「<JACCS>YYYY年M月度お支払い金額確定のご案内」
 *
 * 送信元は観測した 3 アドレスを **完全一致** で許可する（@jaccs.co.jp のドメイン一致ではない）。
 * 件名の分類が別に掛かるため、確定案内以外は対象外になる。
 */
export const jaccsGmailRule: GmailProviderRule = {
  providerKey: "jaccs",
  support: { level: "official" },
  senderAllowlist: ["jaccs3@jaccs.co.jp", "jaccs2@jaccs.co.jp", "jaccs7@jaccs.co.jp"],
  subject: {
    confirmed: [/お支払い?金額確定のご案内/],
  },
  searchSubjects: ["お支払い金額確定のご案内"],
  amountLabels: [/お支払い?(?:予定)?金額/, /ご請求(?:予定)?金額/, /お支払い?額/],
  amountExclude: [/ポイント/, /利用可能/, /前回/, /手数料/, /キャンペーン/],
  dateLabels: [/お支払い?(?:予定)?日/, /お引き?落とし(?:予定)?日/, /口座振替日/, /振替日/],
  dateExclude: [/締め?日/, /ご利用日/],
};

export const jaccsGmailParser = createGmailParser(jaccsGmailRule);
