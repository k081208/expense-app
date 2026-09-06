import type { GmailMailClass, GmailSubjectRules } from "../types";
import { normalizeSubject } from "./text";

/**
 * 件名の分類。
 *
 * 評価順は changed → confirmed → provisional → paymentNotice。
 * どれにも当てはまらなければ irrelevant（利用速報・キャンペーンなど）。
 * 件名だけで金額や支払日を決めることはしない。
 */
export function classifySubject(
  subject: string | null | undefined,
  rules: GmailSubjectRules,
): GmailMailClass {
  const s = normalizeSubject(subject);
  if (!s) return "irrelevant";
  const test = (patterns: readonly RegExp[] | undefined) =>
    (patterns ?? []).some((re) => re.test(s));
  if (test(rules.changed)) return "changed";
  if (test(rules.confirmed)) return "confirmed";
  if (test(rules.provisional)) return "provisional";
  if (test(rules.paymentNotice)) return "payment_notice";
  return "irrelevant";
}
