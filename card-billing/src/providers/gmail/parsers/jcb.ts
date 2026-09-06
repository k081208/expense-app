import { createGmailParser } from "../parse";
import type { GmailProviderRule } from "../types";

/**
 * JCB（Tier A・正式）
 *
 * 実メール探索で確認した事実:
 *   - 送信元: mail@qa.jcb.co.jp / mail@cj.jcb.co.jp（MyJCB）
 *   - 確定:   「JCBカードYYYY年M月分お振替内容確定のご案内」
 *   - 変更:   「JCBカードYYYY年M月分お振替内容変更のご案内」
 *   - 2 枚のカードが同じ件名で届くため、カードの特定は本文の下 4 桁で行う
 *
 * 「変更」は「確定」より後に届く。採用の判定（select.ts）では同じ支払日なら
 * 変更 > 確定、同じ種類なら受信日時が新しい方を使う。
 * 変更案内の「変更前」の金額は除外語で候補から外す。
 */
export const jcbGmailRule: GmailProviderRule = {
  providerKey: "jcb",
  support: { level: "official" },
  senderAllowlist: ["mail@qa.jcb.co.jp", "mail@cj.jcb.co.jp"],
  subject: {
    changed: [/お振替内容変更のご案内/],
    confirmed: [/お振替内容確定のご案内/],
  },
  searchSubjects: ["お振替内容確定のご案内", "お振替内容変更のご案内"],
  amountLabels: [/お振替(?:予定)?金額/, /ご?請求(?:予定)?金額/, /お支払い?(?:予定)?金額/],
  amountExclude: [/変更前/, /ポイント/, /利用可能/, /前回/, /手数料/],
  dateLabels: [/お振替(?:予定)?日/, /振替日/, /お支払い?日/, /お引き?落とし日/],
  dateExclude: [/変更前/, /締め?日/, /ご利用日/],
};

export const jcbGmailParser = createGmailParser(jcbGmailRule);
