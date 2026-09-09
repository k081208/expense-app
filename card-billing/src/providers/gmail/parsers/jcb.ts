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
 * STEP 8B.1 の実メール確認で判明した事実:
 *   - 確定の案内メールには **請求金額が載らない**（MyJCB で確認する形）。
 *     金額を読み取ろうとすると本文中の別の円表記を誤って採用してしまったため、
 *     `amountInMail: false` にして金額の抽出そのものを止め、支払日だけを持つ結果にする。
 *     JCB の金額は Gmail からは得られない（STEP 9 の公式 API など別の取得元が必要）。
 *
 * 「変更」は「確定」より後に届く。採用の判定（select.ts）では同じ支払日なら
 * 変更 > 確定、同じ種類なら受信日時が新しい方を使う。
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
  amountInMail: false,
  amountLabels: [],
  amountExclude: [],
  dateLabels: [/お振替(?:予定)?日/, /振替日/, /お支払い?日/, /お引き?落とし日/],
  dateExclude: [/変更前/, /締め?日/, /ご利用日/],
};

export const jcbGmailParser = createGmailParser(jcbGmailRule);
