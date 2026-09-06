import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { DiscoveryRunner } from "@/components/dev/discovery-runner";
import { providerLabel } from "@/lib/cards/catalog";
import { listAllCards } from "@/lib/cards/queries";
import { listGmailAssignments, listGmailConnections } from "@/lib/gmail/connections";
import { runGmailDiscoveryAction } from "@/lib/gmail/discovery-actions";
import { isGmailDiscoveryEnabled } from "@/lib/gmail/discovery-guard";
import { planDiscoveryTargets } from "@/lib/gmail/discovery";

export const metadata: Metadata = { title: "Gmail 探索（開発用）" };
export const dynamic = "force-dynamic";

/**
 * 開発専用: 請求メールの探索（Discovery）。
 *
 * 実際に届いているカード会社メールの「送信元」と「件名の形」を調べ、
 * STEP 8B で正式な取得条件を決めるための材料にする。
 *
 * - 本番では 404（NODE_ENV=production、または ENABLE_GMAIL_DISCOVERY 未設定）
 * - ログイン中ユーザーの連携だけを使う（service role は使わない）
 * - どの Gmail で探すかは DB の割り当て（card_connection_assignments）から決める
 * - 本文・snippet は取得しない。結果は保存しない
 */
export default async function GmailDiscoveryPage() {
  if (!isGmailDiscoveryEnabled()) notFound();

  const [cards, assignments, connections] = await Promise.all([
    listAllCards(),
    listGmailAssignments(),
    listGmailConnections(),
  ]);
  const plan = planDiscoveryTargets({ cards, assignments, connections });

  return (
    <AppShell
      title="Gmail 探索（開発用）"
      subtitle="実際に届いている請求メールの送信元・件名を調べます"
      action={
        <Link
          href="/settings/connections"
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Gmail 連携
        </Link>
      }
    >
      <div className="space-y-4">
        <SectionCard title="探索する単位（カード会社 × Gmail アカウント）">
          {plan.targets.length === 0 ? (
            <p className="text-sm text-muted">
              探索できる単位がありません。カードに Gmail アカウントを割り当ててください。
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {plan.targets.map((t) => (
                <li key={`${t.providerKey}:${t.connectionId}`}>
                  <span className="font-medium">{providerLabel(t.providerKey)}</span>
                  <span className="text-muted"> → {t.accountEmailMasked}</span>
                  <span className="block text-xs text-muted">{t.cardNames.join(" / ")}</span>
                </li>
              ))}
            </ul>
          )}
          {plan.unassignedCards.length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              割り当て無し（探索しない）: {plan.unassignedCards.map((c) => c.cardName).join(" / ")}
            </p>
          ) : null}
          {plan.inactiveConnectionCards.length > 0 ? (
            <p className="mt-1 text-xs text-muted">
              連携が有効でない（探索しない）:{" "}
              {plan.inactiveConnectionCards.map((c) => `${c.cardName}（${c.status}）`).join(" / ")}
            </p>
          ) : null}
          {plan.unsupportedCards.length > 0 ? (
            <p className="mt-1 text-xs text-muted">
              対象外のカード会社: {plan.unsupportedCards.map((c) => c.cardName).join(" / ")}
            </p>
          ) : null}
        </SectionCard>

        <DiscoveryRunner
          action={runGmailDiscoveryAction}
          providers={[...new Set(plan.targets.map((t) => t.providerKey))].map((key) => ({
            key,
            label: providerLabel(key),
          }))}
        />

        <p className="px-1 text-xs leading-relaxed text-muted">
          取得するのは各メールの From / Subject / Date / Message-ID だけです。本文・snippet・添付は
          取得しません。件名は数字・金額・日付を置き換えた形で表示し、結果はどこにも保存しません。
        </p>
      </div>
    </AppShell>
  );
}
