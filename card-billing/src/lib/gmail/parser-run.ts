import "server-only";

import { logger } from "@/lib/logger";
import { listAllCards } from "@/lib/cards/queries";
import { extractBodyText } from "@/providers/gmail/mime";
import { gmailParserRegistry } from "@/providers/gmail/registry";
import { selectCurrentBillingByCard } from "@/providers/gmail/select";
import type { GmailParseInput, ParsedGmailBilling } from "@/providers/gmail/types";
import { clampLookbackDays, clampMaxMessages } from "@/providers/gmail/config/query";
import { GmailApiError, getGmailMessageFull, listGmailMessages } from "./client";
import { listGmailAssignments, listGmailConnections } from "./connections";
import {
  planParserTargets,
  type GmailParserReport,
  type GmailParserTarget,
  type GmailParserTargetResult,
} from "./parser-plan";
import { shortConnectionRef } from "./tokens";

/**
 * Gmail 請求メール Parser — 実行部分（開発画面のプレビュー用）。
 *
 * 1. ログイン中ユーザーのカード・割り当て・連携を RLS 経由で読む
 * 2. 正式対応の会社 × 連携 を単位にする
 * 3. 単位ごとに **正式な検索条件** で messages.list（少数・1 ページのみ）
 * 4. 一致したメールだけ messages.get（format=full）で本文を取り、Parser に渡す
 * 5. 結果を画面へ返す。**DB へは何も書かない**（billing_records への保存は STEP 10）
 *
 * 本文・件名・message ID はログにも結果にも出さない。出すのは provider、
 * 連携の短縮ハッシュ、件数、分類だけ。
 */

const FULL_FETCH_CONCURRENCY = 3;

export type ParserRunOptions = {
  days?: number;
  maxMessages?: number;
  providerKey?: string | null;
  /** マスク済みの抽出過程を結果に含める（開発画面の調整用） */
  includeDebug?: boolean;
  /** 採用判定の基準日（テスト用） */
  now?: Date;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function toIso(internalDate: string | null): string {
  const t = internalDate ? Number(internalDate) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date(0).toISOString();
}

async function runTarget(
  userId: string,
  target: GmailParserTarget,
  options: Required<Omit<ParserRunOptions, "providerKey">>,
): Promise<GmailParserTargetResult> {
  const parser = gmailParserRegistry.get(target.providerKey);
  const connection = shortConnectionRef(target.connectionId);
  const base: GmailParserTargetResult = {
    providerKey: target.providerKey,
    connectionId: target.connectionId,
    accountEmailMasked: target.accountEmailMasked,
    cardNames: target.cards.map((c) => c.displayName),
    query: "",
    listed: 0,
    hasMore: false,
    fetchErrors: [],
    error: null,
    tokenRefreshed: false,
    messages: [],
    current: [],
  };
  if (!parser || parser.support.level !== "official") return { ...base, error: "provider_unsupported" };

  const query = parser.buildQuery(options.days);
  let tokenRefreshed = false;

  let list;
  try {
    list = await listGmailMessages({
      userId,
      connectionId: target.connectionId,
      query,
      maxResults: options.maxMessages,
      includeSpamTrash: false,
    });
  } catch (e) {
    const category = e instanceof GmailApiError ? e.category : "unknown";
    logger.warn("請求メールの一覧取得に失敗しました", { provider: target.providerKey, connection, category });
    return { ...base, query, error: category };
  }
  tokenRefreshed ||= list.tokenRefreshed;

  const errorCounts = new Map<string, number>();
  const parsed = await mapWithConcurrency(list.messages, FULL_FETCH_CONCURRENCY, async (m) => {
    let input: GmailParseInput;
    try {
      const full = await getGmailMessageFull({ userId, connectionId: target.connectionId, messageId: m.id });
      tokenRefreshed ||= full.tokenRefreshed;
      const body = extractBodyText(full.payload);
      input = {
        from: full.headers["from"] ?? null,
        subject: full.headers["subject"] ?? null,
        receivedAt: toIso(full.internalDate),
        bodyText: body.status === "ok" ? body.text : null,
        bodyStatus: body.status,
      };
      // 本文つきの応答はここで手放す（以降は input の文字列だけを使う）
      full.payload = null;
    } catch (e) {
      const category = e instanceof GmailApiError ? e.category : "unknown";
      errorCounts.set(category, (errorCounts.get(category) ?? 0) + 1);
      return null;
    }
    const result = parser.parse(input, target.cards);
    return options.includeDebug ? result : { ...result, debug: [] };
  });

  const messages = parsed
    .filter((p): p is ParsedGmailBilling => p !== null)
    .sort((a, b) => b.sourceReceivedAt.localeCompare(a.sourceReceivedAt));
  const current = [...selectCurrentBillingByCard(messages, options.now).values()];

  const statusCounts: Record<string, number> = {};
  for (const r of messages) {
    const key = r.status === "success" ? "success" : (r.errorCode ?? "error");
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }
  logger.info("請求メールを解析しました", {
    provider: target.providerKey,
    connection,
    listed: list.messages.length,
    hasMore: Boolean(list.nextPageToken),
    results: statusCounts,
    tokenRefreshed,
  });

  return {
    ...base,
    query,
    listed: list.messages.length,
    hasMore: Boolean(list.nextPageToken),
    fetchErrors: [...errorCounts.entries()].map(([category, count]) => ({ category, count })),
    tokenRefreshed,
    messages,
    current,
  };
}

export async function runGmailParserPreview(
  userId: string,
  options: ParserRunOptions = {},
): Promise<GmailParserReport> {
  const resolved = {
    days: clampLookbackDays(options.days),
    maxMessages: clampMaxMessages(options.maxMessages),
    includeDebug: options.includeDebug ?? false,
    now: options.now ?? new Date(),
  };
  const providerKey = options.providerKey || null;

  const [cards, assignments, connections] = await Promise.all([
    listAllCards(),
    listGmailAssignments(),
    listGmailConnections(),
  ]);
  const { targets: allTargets, ...plan } = planParserTargets({ cards, assignments, connections });
  const targets = providerKey ? allTargets.filter((t) => t.providerKey === providerKey) : allTargets;

  const results: GmailParserTargetResult[] = [];
  for (const target of targets) {
    results.push(await runTarget(userId, target, resolved));
  }

  return {
    generatedAt: resolved.now.toISOString(),
    days: resolved.days,
    maxMessages: resolved.maxMessages,
    providerKey,
    includeDebug: resolved.includeDebug,
    plan,
    results,
  };
}
