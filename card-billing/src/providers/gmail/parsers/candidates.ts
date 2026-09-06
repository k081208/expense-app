import { createGmailParser } from "../parse";
import type { GmailProviderRule } from "../types";

/**
 * まだ正式対応していないカード会社（Tier B / Tier C）。
 *
 * 推測で本文の形を決め打ちしないため、規則は空にして `support.level = "unsupported"` にする。
 * 探索で観測した送信元・件名はコメントに残し、実メール本文を確認できた時点で
 * 専用ファイルへ移して正式化する。
 *
 * `parse()` は常に provider_unsupported を返し、実行側はこれらの会社について
 * Gmail を検索しない。
 */

const unsupported = (
  providerKey: string,
  reason: "insufficient_real_samples" | "limited_sample" | "waiting_for_real_sample",
  note: string,
): GmailProviderRule => ({
  providerKey,
  support: { level: "unsupported", reason, note },
  senderAllowlist: [],
  subject: { confirmed: [] },
  searchSubjects: [],
  amountLabels: [],
  amountExclude: [],
  dateLabels: [],
});

/**
 * エディオンカード（発行: オリコ）— Tier B
 * 観測: e-ask@orico.co.jp（30 通）/ e-service@orico.co.jp（8 通）、
 *       「ご利用明細更新のお知らせ」「【eオリコ】口座振替によるお支払完了のお知らせ」。
 * 請求金額の案内メールに当たる件名を本文で確認できていないため未対応。
 */
export const edionGmailParser = createGmailParser(
  unsupported(
    "edion",
    "insufficient_real_samples",
    "オリコからの「ご利用明細更新のお知らせ」に金額・支払日が含まれるか本文で未確認",
  ),
);

/**
 * イオンカード — Tier B
 * 観測: statement@email.aeon.co.jp「YYYY年M月ご請求額のお知らせ」が 1 年で 1 通のみ。
 * 形が安定しているか判断できないため未対応。
 */
export const aeonGmailParser = createGmailParser(
  unsupported("aeon", "limited_sample", "請求額のお知らせが 1 通のみで本文未確認"),
);

/**
 * セゾンカード — Tier B
 * 観測: express@mail.saisoncard.co.jp「YYYY年M月お支払金額のお知らせ」が 1 通のみ。
 */
export const saisonGmailParser = createGmailParser(
  unsupported("saison", "limited_sample", "お支払金額のお知らせが 1 通のみで本文未確認"),
);

/**
 * au PAY カード — Tier C
 * 通知先が携帯キャリアのアドレスだったため Gmail に 1 通も無い。
 * 通知先を Gmail に変更済み。次回の請求メールが届いてから規則を作る。
 */
export const aupayGmailParser = createGmailParser(
  unsupported("aupay", "waiting_for_real_sample", "通知先変更後の最初の請求メール待ち"),
);
