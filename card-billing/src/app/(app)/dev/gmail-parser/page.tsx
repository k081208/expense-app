import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { ParserRunner } from "@/components/dev/parser-runner";
import { providerLabel } from "@/lib/cards/catalog";
import { listAllCards } from "@/lib/cards/queries";
import { formatLastFour } from "@/lib/format";
import { listGmailAssignments, listGmailConnections } from "@/lib/gmail/connections";
import { isGmailDiscoveryEnabled } from "@/lib/gmail/discovery-guard";
import { runGmailParserPreviewAction } from "@/lib/gmail/parser-actions";
import { planParserTargets } from "@/lib/gmail/parser-plan";
import { gmailParserRegistry } from "@/providers/gmail/registry";

export const metadata: Metadata = { title: "Gmail 請求メール解析（開発用）" };
export const dynamic = "force-dynamic";

const UNSUPPORTED_REASON_LABEL: Record<string, string> = {
  insufficient_real_samples: "実メール本文の確認が足りない",
  limited_sample: "実メールが少なく形を確認できない",
  waiting_for_real_sample: "実メール待ち",
  not_implemented: "未対応",
};

/**
 * 開発専用: 請求メール Parser のプレビュー。
 *
 * 正式な検索条件で少数のメールを取り、金額・支払日・対象カードを解析した結果を表示する。
 * - 本番では 404（NODE_ENV=production、または ENABLE_GMAIL_DISCOVERY 未設定）
 * - 表示するのは会社名・カード表示名・伏字の下 4 桁・金額・支払日・確定/暫定・
 *   受信日時・解析状態・分類だけ。本文・件名・message ID は表示しない
 * - 結果は DB に保存しない
 */
export default async function GmailParserPage() {
  if (!isGmailDiscoveryEnabled()) notFound();

  const [cards, assignments, connections] = await Promise.all([
    listAllCards(),
    listGmailAssignments(),
    listGmailConnections(),
  ]);
  const plan = planParserTargets({ cards, assignments, connections });
  const officialKeys = gmailParserRegistry.official().map((p) => p.providerKey);

  return (
    <AppShell
      title="Gmail 請求メール解析（開発用）"
      subtitle="正式な送信元・件名で絞ったメールから金額と支払日を読み取ります"
      action={
        <Link
          href="/dev/gmail-discovery"
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          探索へ
        </Link>
      }
    >
      <div className="space-y-4">
        <SectionCard title="解析する単位（カード会社 × Gmail アカウント）">
          {plan.targets.length === 0 ? (
            <p className="text-sm text-muted">
              解析できる単位がありません。正式対応の会社のカードに Gmail を割り当ててください。
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {plan.targets.map((t) => (
                <li key={`${t.providerKey}:${t.connectionId}`}>
                  <span className="font-medium">{providerLabel(t.providerKey)}</span>
                  <span className="text-muted"> → {t.accountEmailMasked}</span>
                  <span className="block text-xs text-muted">
                    {t.cards
                      .map((c) => `${c.displayName}${c.lastFour ? ` ${formatLastFour(c.lastFour)}` : "（下4桁 未登録）"}`)
                      .join(" / ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            正式対応: {officialKeys.map((k) => providerLabel(k)).join(" / ")}
          </p>
          {plan.unsupportedCards.length > 0 ? (
            <p className="mt-1 text-xs text-muted">
              未対応（解析しない）:{" "}
              {plan.unsupportedCards
                .map((c) => `${c.cardName}（${UNSUPPORTED_REASON_LABEL[c.reason] ?? c.reason}）`)
                .join(" / ")}
            </p>
          ) : null}
          {plan.unassignedCards.length > 0 ? (
            <p className="mt-1 text-xs text-muted">
              割り当て無し（解析しない）: {plan.unassignedCards.map((c) => c.cardName).join(" / ")}
            </p>
          ) : null}
          {plan.inactiveConnectionCards.length > 0 ? (
            <p className="mt-1 text-xs text-muted">
              連携が有効でない（解析しない）:{" "}
              {plan.inactiveConnectionCards.map((c) => `${c.cardName}（${c.status}）`).join(" / ")}
            </p>
          ) : null}
        </SectionCard>

        <ParserRunner
          action={runGmailParserPreviewAction}
          providers={[...new Set(plan.targets.map((t) => t.providerKey))].map((key) => ({
            key,
            label: providerLabel(key),
          }))}
        />

        <p className="px-1 text-xs leading-relaxed text-muted">
          本文は解析のためにだけ読み、保存もログ出力もしません。画面に出るのは読み取った金額・支払日・
          対象カードと解析の状態だけです。同じ会社のカードが複数あるときは、本文の下 4 桁で
          カードを決めるため、各カードに下 4 桁の登録が必要です。
        </p>
      </div>
    </AppShell>
  );
}
