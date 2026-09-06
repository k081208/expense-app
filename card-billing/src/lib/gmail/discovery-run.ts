import "server-only";

import { logger } from "@/lib/logger";
import { listAllCards } from "@/lib/cards/queries";
import { listGmailAssignments, listGmailConnections } from "./connections";
import {
  GmailApiError,
  getGmailMessageMetadata,
  listGmailMessages,
} from "./client";
import {
  aggregateCandidates,
  buildDiscoveryQuery,
  DEFAULT_DISCOVERY_DAYS,
  DEFAULT_DISCOVERY_MAX_RESULTS,
  DISCOVERY_DAYS_CEILING,
  DISCOVERY_MAX_RESULTS_CEILING,
  planDiscoveryTargets,
  sanitizeExtraQuery,
  type CandidateHeader,
  type DiscoveryReport,
  type DiscoveryTarget,
  type DiscoveryTargetResult,
} from "./discovery";
import { shortConnectionRef } from "./tokens";

/**
 * 請求メールの探索（Discovery）— 実行部分。
 *
 * 1. ログイン中ユーザーのカード・割り当て・連携を RLS 経由で読む
 * 2. provider_key × connection_id の単位に重複なくまとめる
 * 3. 単位ごとに messages.list（q で絞る・上限あり・1 ページのみ）
 * 4. 候補ごとに messages.get（format=metadata、From / Subject / Date / Message-ID のみ）
 * 5. From 別・件名テンプレート別に数える
 *
 * 本文・snippet・添付は取得しない。結果は DB に保存しない。
 */

/** 候補ヘッダーの取得は同時 5 件まで（Gmail の利用者あたり制限に余裕を持たせる） */
const METADATA_CONCURRENCY = 5;

export type DiscoveryOptions = {
  days?: number;
  maxResults?: number;
  includeSpamTrash?: boolean;
  /** 指定したカード会社だけを探索する（未指定なら全単位） */
  providerKey?: string | null;
  /** 検索条件に追加する語（例: from:example.co.jp）。空なら何も足さない */
  extraQuery?: string | null;
};

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

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

async function discoverTarget(
  userId: string,
  target: DiscoveryTarget,
  options: Required<DiscoveryOptions>,
): Promise<DiscoveryTargetResult> {
  const query = buildDiscoveryQuery(target.providerKey, options.days, options.extraQuery ?? "");
  const connection = shortConnectionRef(target.connectionId);
  let tokenRefreshed = false;

  const base: DiscoveryTargetResult = {
    ...target,
    query,
    resultSizeEstimate: 0,
    hasMore: false,
    aggregate: aggregateCandidates([]),
    fetchErrors: [],
    error: null,
    tokenRefreshed: false,
  };

  let list;
  try {
    list = await listGmailMessages({
      userId,
      connectionId: target.connectionId,
      query,
      maxResults: options.maxResults,
      includeSpamTrash: options.includeSpamTrash,
    });
  } catch (e) {
    const category = e instanceof GmailApiError ? e.category : "unknown";
    logger.warn("探索の一覧取得に失敗しました", {
      provider: target.providerKey,
      connection,
      category,
    });
    return { ...base, error: category };
  }
  tokenRefreshed ||= list.tokenRefreshed;

  const errorCounts = new Map<string, number>();
  const headers = await mapWithConcurrency(list.messages, METADATA_CONCURRENCY, async (m) => {
    try {
      const meta = await getGmailMessageMetadata({
        userId,
        connectionId: target.connectionId,
        messageId: m.id,
      });
      tokenRefreshed ||= meta.tokenRefreshed;
      const header: CandidateHeader = {
        from: meta.headers["from"] ?? null,
        subject: meta.headers["subject"] ?? null,
        internalDate: meta.internalDate,
      };
      return header;
    } catch (e) {
      const category = e instanceof GmailApiError ? e.category : "unknown";
      errorCounts.set(category, (errorCounts.get(category) ?? 0) + 1);
      return null;
    }
  });

  const collected = headers.filter((h): h is CandidateHeader => h !== null);
  const aggregate = aggregateCandidates(collected);

  logger.info("探索を実行しました", {
    provider: target.providerKey,
    connection,
    candidates: aggregate.candidateCount,
    estimate: list.resultSizeEstimate,
    hasMore: Boolean(list.nextPageToken),
    tokenRefreshed,
  });

  return {
    ...base,
    resultSizeEstimate: list.resultSizeEstimate,
    hasMore: Boolean(list.nextPageToken),
    aggregate,
    fetchErrors: [...errorCounts.entries()].map(([category, count]) => ({ category, count })),
    tokenRefreshed,
  };
}

/**
 * ログイン中ユーザーの全対象について探索する。
 * 単位ごとに順番に実行する（同時に走らせて制限に当たらないように）。
 */
export async function runGmailDiscovery(
  userId: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveryReport> {
  const resolved: Required<DiscoveryOptions> = {
    days: clamp(options.days, DEFAULT_DISCOVERY_DAYS, 1, DISCOVERY_DAYS_CEILING),
    maxResults: clamp(options.maxResults, DEFAULT_DISCOVERY_MAX_RESULTS, 1, DISCOVERY_MAX_RESULTS_CEILING),
    includeSpamTrash: options.includeSpamTrash ?? false,
    providerKey: options.providerKey || null,
    extraQuery: sanitizeExtraQuery(options.extraQuery) || null,
  };

  const [cards, assignments, connections] = await Promise.all([
    listAllCards(),
    listGmailAssignments(),
    listGmailConnections(),
  ]);
  const { targets: allTargets, ...plan } = planDiscoveryTargets({ cards, assignments, connections });
  // 1 社だけの再探索（追加条件で絞り込むとき）。割り当てに無い会社は何もしない
  const targets = resolved.providerKey
    ? allTargets.filter((t) => t.providerKey === resolved.providerKey)
    : allTargets;

  const results: DiscoveryTargetResult[] = [];
  for (const target of targets) {
    results.push(await discoverTarget(userId, target, resolved));
  }

  return {
    generatedAt: new Date().toISOString(),
    days: resolved.days,
    maxResults: resolved.maxResults,
    includeSpamTrash: resolved.includeSpamTrash,
    providerKey: resolved.providerKey,
    extraQuery: resolved.extraQuery,
    plan,
    results,
  };
}
