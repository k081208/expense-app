import { createGmailParser } from "../parse";
import type { GmailProviderRule } from "../types";

/**
 * まだ正式対応していないカード会社（Tier B / Tier C）。
 *
 * すべて `support.level = "unsupported"`。通常の実行では検索も解析もしない。
 *
 * Tier B（エディオン / イオン / セゾン）には `trial: true` を付け、開発画面の
 * 「未対応の会社も試す」を選んだときだけ、探索で **観測済み** の送信元・件名で
 * 少数のメールを取り、本文の形（マスク済みの構造ヒント）を確認できるようにする。
 * ここに書く送信元・件名は STEP 8A の実メール探索で観測した事実だけで、
 * 金額・支払日のラベルは一般的な語（結果は採用しない）。
 * 実本文で 金額・支払日・カードの特定 がそろって確認できた会社だけを専用ファイルへ移して正式化する。
 */

const GENERIC_AMOUNT_LABELS = [/ご請求(?:予定)?(?:金)?額/, /お支払い?(?:予定)?(?:金)?額/, /請求(?:金)?額/, /お引き?落とし(?:予定)?(?:金)?額/];
const GENERIC_AMOUNT_EXCLUDE = [/ポイント/, /利用可能/, /前回/, /手数料/, /キャンペーン/];
const GENERIC_DATE_LABELS = [/お支払い?(?:予定)?日/, /お引き?落とし(?:予定)?日/, /引落(?:予定)?日/, /口座振替(?:予定)?日/, /振替日/];
const GENERIC_DATE_EXCLUDE = [/締め?日/, /ご利用日/];

const trialRule = (
  providerKey: string,
  reason: "insufficient_real_samples" | "limited_sample",
  note: string,
  observed: { senders: string[]; subjects: RegExp[]; searchSubjects: string[] },
): GmailProviderRule => ({
  providerKey,
  support: { level: "unsupported", reason, note },
  trial: true,
  senderAllowlist: observed.senders,
  subject: { confirmed: observed.subjects },
  searchSubjects: observed.searchSubjects,
  amountLabels: GENERIC_AMOUNT_LABELS,
  amountExclude: GENERIC_AMOUNT_EXCLUDE,
  dateLabels: GENERIC_DATE_LABELS,
  dateExclude: GENERIC_DATE_EXCLUDE,
});

/**
 * エディオンカード（発行: オリコ）— Tier B
 * 観測: e-ask@orico.co.jp（30 通）/ e-service@orico.co.jp（8 通）、
 *       「ご利用明細更新のお知らせ」「【eオリコ】口座振替によるお支払完了のお知らせ」。
 * 請求金額の案内に当たる件名を本文で確認できていないため未対応。
 */
export const edionGmailParser = createGmailParser(
  trialRule(
    "edion",
    "insufficient_real_samples",
    "オリコからの「ご利用明細更新のお知らせ」に金額・支払日が含まれるか本文で未確認",
    {
      senders: ["e-ask@orico.co.jp", "e-service@orico.co.jp"],
      subjects: [/ご利用明細更新のお知らせ/, /口座振替によるお支払完了のお知らせ/],
      searchSubjects: ["ご利用明細更新のお知らせ", "口座振替によるお支払完了のお知らせ"],
    },
  ),
);

/**
 * イオンカード — Tier B
 * 観測: statement@email.aeon.co.jp「YYYY年M月ご請求額のお知らせ」が 1 年で 1 通のみ。
 * 形が安定しているか判断できないため未対応。
 */
export const aeonGmailParser = createGmailParser(
  trialRule("aeon", "limited_sample", "請求額のお知らせが 1 通のみで本文未確認", {
    senders: ["statement@email.aeon.co.jp"],
    subjects: [/ご請求額のお知らせ/],
    searchSubjects: ["ご請求額のお知らせ"],
  }),
);

/**
 * セゾンカード — Tier B
 * 観測: express@mail.saisoncard.co.jp「YYYY年M月お支払金額のお知らせ」が 1 通のみ。
 */
export const saisonGmailParser = createGmailParser(
  trialRule("saison", "limited_sample", "お支払金額のお知らせが 1 通のみで本文未確認", {
    senders: ["express@mail.saisoncard.co.jp"],
    subjects: [/お支払い?金額のお知らせ/],
    searchSubjects: ["お支払金額のお知らせ"],
  }),
);

/**
 * au PAY カード — Tier C
 * 通知先が携帯キャリアのアドレスだったため Gmail に 1 通も無い。
 * 通知先を Gmail に変更済み。次回の請求メールが届いてから規則を作る。試行もしない。
 */
export const aupayGmailParser = createGmailParser({
  providerKey: "aupay",
  support: { level: "unsupported", reason: "waiting_for_real_sample", note: "通知先変更後の最初の請求メール待ち" },
  senderAllowlist: [],
  subject: { confirmed: [] },
  searchSubjects: [],
  amountLabels: [],
  amountExclude: [],
  dateLabels: [],
});
