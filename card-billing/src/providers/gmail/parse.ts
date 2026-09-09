import { extractAmount } from "./extract/amount";
import { extractPaymentDate } from "./extract/date";
import { collectStructureHints, type StructureHintKind } from "./extract/hints";
import { describeLastFourCandidates, extractLastFourCandidates } from "./extract/last-four";
import { verifySender } from "./extract/sender";
import { classifySubject } from "./extract/subject";
import { normalizeText } from "./extract/text";
import { matchCard } from "./match-card";
import { buildOfficialGmailQuery } from "./config/query";
import type {
  GmailBillingParser,
  GmailCardCandidate,
  GmailParseErrorCode,
  GmailParseInput,
  GmailProviderRule,
  ParsedGmailBilling,
} from "./types";

/**
 * 規則（GmailProviderRule）から Parser を作る。
 *
 * 1 通の処理順:
 *   送信元の完全一致 → 件名の分類 → 本文の有無 → カードの特定（本文の下 4 桁）
 *   → 金額（ラベル基準） → 支払日（ラベル基準・年補完・妥当性）
 * どこで止まっても例外は投げず、分類コードを持つ結果を返す。
 */
export function createGmailParser(rule: GmailProviderRule): GmailBillingParser {
  return {
    providerKey: rule.providerKey,
    support: rule.support,
    rule,
    buildQuery: (days) => buildOfficialGmailQuery(rule, days),
    classifySubject: (subject) => classifySubject(subject, rule.subject),
    canTrial:
      rule.support.level === "unsupported" &&
      rule.trial === true &&
      rule.senderAllowlist.length > 0 &&
      rule.searchSubjects.length > 0,
    parse: (input, cards, options) => parseWithRule(rule, input, cards, options),
  };
}

function base(rule: GmailProviderRule, input: GmailParseInput): ParsedGmailBilling {
  return {
    providerKey: rule.providerKey,
    mailClass: "irrelevant",
    cardId: null,
    cardDisplayName: null,
    cardLastFour: null,
    matchedBy: null,
    amount: null,
    paymentDate: null,
    isProvisional: false,
    status: "error",
    errorCode: null,
    sourceReceivedAt: input.receivedAt,
    trial: false,
    debug: [],
  };
}

function fail(result: ParsedGmailBilling, code: GmailParseErrorCode): ParsedGmailBilling {
  return { ...result, status: "error", errorCode: code };
}

export function parseWithRule(
  rule: GmailProviderRule,
  input: GmailParseInput,
  cards: readonly GmailCardCandidate[],
  options: { trial?: boolean } = {},
): ParsedGmailBilling {
  const result = base(rule, input);

  if (rule.support.level !== "official") {
    const trialAllowed = options.trial === true && rule.trial === true && rule.senderAllowlist.length > 0;
    if (!trialAllowed) return fail(result, "provider_unsupported");
    result.trial = true;
    result.debug.push("試行モード: 未対応の会社。結果は採用しない");
  }

  const sender = verifySender(input.from, rule.senderAllowlist);
  if (!sender.ok) {
    result.debug.push(
      sender.address ? `送信元が正式な送信元と一致しません（${sender.address}）` : "送信元を読み取れません",
    );
    return fail(result, "sender_mismatch");
  }

  result.mailClass = classifySubject(input.subject, rule.subject);
  if (result.mailClass === "irrelevant") {
    return fail(result, "subject_mismatch");
  }
  result.isProvisional = result.mailClass === "provisional";

  if (input.bodyStatus === "decode_failed") return fail(result, "body_decode_failed");
  if (input.bodyStatus === "missing" || !input.bodyText || !input.bodyText.trim()) {
    return fail(result, "body_missing");
  }

  const text = normalizeText(input.bodyText);
  const receivedAt = new Date(input.receivedAt);

  // カード特定（下 4 桁が最優先。display_name は使わない）
  const lastFourCandidates = extractLastFourCandidates(text);
  result.debug.push(describeLastFourCandidates(lastFourCandidates));
  const match = matchCard(cards, lastFourCandidates);
  if (match.status === "matched") {
    result.cardId = match.card.id;
    result.cardDisplayName = match.card.displayName;
    result.cardLastFour = match.card.lastFour;
    result.matchedBy = match.matchedBy;
  } else {
    result.debug.push(match.detail);
  }

  // 金額（メールに金額が載らない会社では抽出しない。別の円表記を誤って採用しないため）
  const amount =
    rule.amountInMail === false
      ? { amount: null, status: "skipped" as const, candidates: [], notes: ["この会社のメールには請求金額が載らないため、金額は読み取らない（支払日のみ）"] }
      : extractAmount(text, rule.amountLabels, rule.amountExclude);
  result.debug.push(...amount.notes);
  for (const c of amount.candidates) {
    result.debug.push(
      `金額候補: ラベル${c.labelIndex + 1} 行${c.line + 1} → ${c.amount.toLocaleString("ja-JP")}円`,
    );
  }
  if (amount.status === "ok") result.amount = amount.amount;

  // 支払日
  const date = extractPaymentDate(text, {
    labels: rule.dateLabels,
    exclude: rule.dateExclude,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    subjectFallback: rule.dateFromSubject ? input.subject : null,
  });
  result.debug.push(...date.notes);
  for (const c of date.candidates) {
    result.debug.push(`支払日候補: ラベル${c.labelIndex + 1} 行${c.line + 1} → ${c.date}`);
  }
  if (date.status === "ok") result.paymentDate = date.paymentDate;

  // 失敗したときは、本文の構造（数字をマスクした行）をヒントとして添える
  const hintKinds: StructureHintKind[] = [];
  if (match.status === "error") hintKinds.push("card");
  if (amount.status !== "ok" && amount.status !== "skipped") hintKinds.push("amount");
  if (date.status !== "ok") hintKinds.push("date");
  if (hintKinds.length > 0) result.debug.push(...collectStructureHints(text, hintKinds));

  // 失敗の優先順位: カード → 金額 → 支払日
  if (match.status === "error") return fail(result, match.code);
  if (amount.status === "ambiguous") return fail(result, "amount_ambiguous");
  if (amount.status === "none" && result.mailClass !== "payment_notice") {
    // 引き落とし日の案内は金額が無いことがある。それ以外は金額必須
    return fail(result, "amount_parse_failed");
  }
  if (date.status !== "ok") return fail(result, "payment_date_parse_failed");

  return { ...result, status: "success", errorCode: null };
}
