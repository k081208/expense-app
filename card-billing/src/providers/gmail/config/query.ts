import type { GmailProviderRule } from "../types";

/**
 * 正式な Gmail 検索条件。
 *
 * 探索（Discovery）の広い語とは別に、実メールで確認した送信元と件名だけで絞る。
 *   from:(a@example.co.jp OR b@example.co.jp) subject:("語1" OR "語2") newer_than:120d -from:me
 *
 * 本文（format=full）を取るのは、この条件に一致した少数のメールだけ。
 */

/** 初回は 3〜6 か月。既定は 4 か月ぶん。 */
export const DEFAULT_PARSER_LOOKBACK_DAYS = 120;
export const PARSER_LOOKBACK_DAYS_CEILING = 365;
/** 1 単位あたり本文を取るメールの上限。探索のような 50〜200 件の取得はしない。 */
export const DEFAULT_PARSER_MAX_MESSAGES = 20;
export const PARSER_MAX_MESSAGES_CEILING = 50;

export function clampLookbackDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return DEFAULT_PARSER_LOOKBACK_DAYS;
  return Math.min(Math.max(1, Math.floor(days)), PARSER_LOOKBACK_DAYS_CEILING);
}

export function clampMaxMessages(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_PARSER_MAX_MESSAGES;
  return Math.min(Math.max(1, Math.floor(value)), PARSER_MAX_MESSAGES_CEILING);
}

function quote(term: string): string {
  return `"${term.replace(/"/g, "")}"`;
}

export function buildOfficialGmailQuery(rule: GmailProviderRule, days: number): string {
  if (rule.senderAllowlist.length === 0 || rule.searchSubjects.length === 0) {
    throw new Error(`正式な検索条件がありません: ${rule.providerKey}`);
  }
  const from =
    rule.senderAllowlist.length === 1
      ? `from:${rule.senderAllowlist[0]}`
      : `from:(${rule.senderAllowlist.join(" OR ")})`;
  const subject =
    rule.searchSubjects.length === 1
      ? `subject:${quote(rule.searchSubjects[0])}`
      : `subject:(${rule.searchSubjects.map(quote).join(" OR ")})`;
  return `${from} ${subject} newer_than:${clampLookbackDays(days)}d -from:me`;
}
