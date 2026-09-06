import type { CardConnectionAssignmentRow, CardRow, ConnectionRow } from "@/types/database";
import { gmailParserRegistry } from "@/providers/gmail/registry";
import type {
  GmailCardCandidate,
  GmailUnsupportedReason,
  ParsedGmailBilling,
} from "@/providers/gmail/types";
import { maskEmail } from "./discovery";

/**
 * Parser 実行の対象決定（純粋な計算部分）と、画面に渡す結果の型。
 *
 * 対象は探索と同じく cards → card_connection_assignments → connections から決める。
 * Gmail アドレスをコードに書かない。正式対応（official）の会社だけを対象にし、
 * それ以外は理由つきで「対象外」として返す。
 */

export type GmailParserTarget = {
  providerKey: string;
  connectionId: string;
  accountEmailMasked: string;
  /** この単位に含まれるカード（下 4 桁はカード特定に使う） */
  cards: GmailCardCandidate[];
};

export type GmailParserPlan = {
  targets: GmailParserTarget[];
  unassignedCards: { cardName: string; providerKey: string }[];
  inactiveConnectionCards: { cardName: string; providerKey: string; status: string }[];
  /** Parser が正式対応していない会社のカード */
  unsupportedCards: { cardName: string; providerKey: string; reason: GmailUnsupportedReason }[];
};

export function planParserTargets(input: {
  cards: CardRow[];
  assignments: CardConnectionAssignmentRow[];
  connections: ConnectionRow[];
}): GmailParserPlan {
  const byCard = new Map(input.assignments.map((a) => [a.card_id, a]));
  const byConnection = new Map(input.connections.map((c) => [c.id, c]));
  const targets = new Map<string, GmailParserTarget>();
  const plan: GmailParserPlan = {
    targets: [],
    unassignedCards: [],
    inactiveConnectionCards: [],
    unsupportedCards: [],
  };

  const cards = [...input.cards]
    .filter((c) => c.enabled)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const card of cards) {
    const support = gmailParserRegistry.supportOf(card.provider_key);
    if (support.level !== "official") {
      plan.unsupportedCards.push({
        cardName: card.display_name,
        providerKey: card.provider_key,
        reason: support.reason,
      });
      continue;
    }
    const assignment = byCard.get(card.id);
    const connection = assignment ? byConnection.get(assignment.connection_id) : undefined;
    if (!assignment || !connection || assignment.source !== "gmail" || connection.kind !== "gmail") {
      plan.unassignedCards.push({ cardName: card.display_name, providerKey: card.provider_key });
      continue;
    }
    if (connection.status !== "connected") {
      plan.inactiveConnectionCards.push({
        cardName: card.display_name,
        providerKey: card.provider_key,
        status: connection.status,
      });
      continue;
    }
    const key = `${card.provider_key} ${connection.id}`;
    const candidate: GmailCardCandidate = {
      id: card.id,
      displayName: card.display_name,
      lastFour: card.last_four,
    };
    const existing = targets.get(key);
    if (existing) existing.cards.push(candidate);
    else {
      targets.set(key, {
        providerKey: card.provider_key,
        connectionId: connection.id,
        accountEmailMasked: maskEmail(connection.account_email),
        cards: [candidate],
      });
    }
  }

  plan.targets = [...targets.values()];
  return plan;
}

// -----------------------------------------------------------------------------
// 結果の型（画面に渡す。本文・件名・message ID は含めない）
// -----------------------------------------------------------------------------

export type GmailParserTargetResult = {
  providerKey: string;
  connectionId: string;
  accountEmailMasked: string;
  cardNames: string[];
  query: string;
  /** 検索に一致した件数（本文を取った件数） */
  listed: number;
  hasMore: boolean;
  /** 本文の取得に失敗した件数（分類のみ） */
  fetchErrors: { category: string; count: number }[];
  /** 一覧取得そのものが失敗した場合の分類 */
  error: string | null;
  tokenRefreshed: boolean;
  /** 1 通ごとの解析結果（受信日時の新しい順） */
  messages: ParsedGmailBilling[];
  /** カードごとの採用候補（次回の請求として選ばれたもの） */
  current: ParsedGmailBilling[];
};

export type GmailParserReport = {
  generatedAt: string;
  days: number;
  maxMessages: number;
  providerKey: string | null;
  includeDebug: boolean;
  plan: Omit<GmailParserPlan, "targets">;
  results: GmailParserTargetResult[];
};
