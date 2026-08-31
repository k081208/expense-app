import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { Alert } from "@/components/ui/alert";
import { SectionCard } from "@/components/ui/section-card";
import { ConnectionItem } from "@/components/settings/connection-item";
import { CardSourceItem } from "@/components/settings/card-source-item";
import { PendingButton } from "@/components/settings/pending-button";
import { startGmailConnection } from "@/lib/gmail/actions";
import {
  assignmentMap,
  listGmailAssignments,
  listGmailConnections,
} from "@/lib/gmail/connections";
import { gmailErrorMessage } from "@/lib/gmail/errors";
import { listAllCards } from "@/lib/cards/queries";
import { hasGmailOAuthEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Gmail 連携" };

/** 連携状態は都度確認する必要があるため、ビルド時に固定しない。 */
export const dynamic = "force-dynamic";

/**
 * Gmail 連携の設定画面。
 *
 * できること
 *   - 連携済みの Gmail アカウントを一覧で確認する
 *   - Gmail アカウントを追加する（複数可）
 *   - 連携を解除する
 *   - カードごとに、請求メールをどのアカウントから読むかを決める
 *
 * ここに表示するのはアカウント名と状態だけで、トークンは一切扱わない。
 * トークンはサーバー側で暗号化して保存され、ブラウザへは渡らない。
 */
export default async function GmailConnectionsPage(
  props: PageProps<"/settings/connections">,
) {
  const searchParams = await props.searchParams;
  const configured = hasGmailOAuthEnv();

  const [connections, assignments, cards] = await Promise.all([
    listGmailConnections(),
    listGmailAssignments(),
    listAllCards(),
  ]);

  const selected = assignmentMap(assignments);

  // 連携ごとの割り当て枚数
  const assignedCount = new Map<string, number>();
  for (const connectionId of selected.values()) {
    assignedCount.set(connectionId, (assignedCount.get(connectionId) ?? 0) + 1);
  }

  const activeCount = connections.filter((c) => c.status === "connected").length;

  return (
    <AppShell
      title="Gmail 連携"
      subtitle={
        connections.length === 0
          ? undefined
          : `${connections.length} アカウント（連携中 ${activeCount}）`
      }
      action={
        <Link
          href="/"
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ダッシュボード
        </Link>
      }
    >
      <div className="space-y-4">
        {searchParams.error ? (
          <Alert>{gmailErrorMessage(searchParams.error)}</Alert>
        ) : null}
        {searchParams.connected ? (
          <Alert tone="info">Gmail アカウントを連携しました。</Alert>
        ) : null}
        {searchParams.reconnected ? (
          <Alert tone="info">
            Gmail アカウントを再連携しました。カードごとの設定はそのままです。
          </Alert>
        ) : null}
        {searchParams.disconnected ? (
          <Alert tone="info">
            連携を解除しました。カードごとの設定は残しています。
          </Alert>
        ) : null}

        {configured ? null : (
          <SectionCard>
            <p className="text-sm leading-relaxed text-muted">
              Gmail 連携の設定がまだ済んでいません。README の「Gmail 連携の設定」
              に沿って Google Cloud Console でクライアントを作成し、
              <code className="mx-1 rounded bg-surface-muted px-1 py-0.5">
                .env.local
              </code>
              へ登録してください。
            </p>
          </SectionCard>
        )}

        <form action={startGmailConnection}>
          <PendingButton
            variant="primary"
            pendingLabel="Google へ移動しています…"
            className="w-full"
          >
            Gmail アカウントを追加
          </PendingButton>
        </form>

        <section aria-labelledby="connections-heading">
          <h2
            id="connections-heading"
            className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted"
          >
            Gmail アカウント
          </h2>
          {connections.length === 0 ? (
            <SectionCard>
              <p className="text-sm leading-relaxed text-muted">
                まだ Gmail アカウントを連携していません。追加すると、
                カード会社から届く請求のお知らせメールを読み取って、
                次回の支払予定をダッシュボードにまとめられるようになります。
              </p>
            </SectionCard>
          ) : (
            <ul className="space-y-3">
              {connections.map((connection) => (
                <ConnectionItem
                  key={connection.id}
                  connection={connection}
                  assignedCount={assignedCount.get(connection.id) ?? 0}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="assignments-heading">
          <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
            <h2
              id="assignments-heading"
              className="text-xs font-semibold tracking-wide text-muted"
            >
              カードごとの取得元
            </h2>
            <Link
              href="/cards"
              className="rounded px-1 py-1.5 text-xs text-muted underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              カード管理
            </Link>
          </div>

          {cards.length === 0 ? (
            <SectionCard>
              <p className="text-sm leading-relaxed text-muted">
                カードがまだ登録されていません。先にカードを登録してください。
              </p>
            </SectionCard>
          ) : (
            <ul className="space-y-3">
              {cards.map((card) => (
                <CardSourceItem
                  key={card.id}
                  card={card}
                  connections={connections}
                  selectedConnectionId={selected.get(card.id) ?? null}
                />
              ))}
            </ul>
          )}
        </section>

        <p className="px-1 text-xs leading-relaxed text-muted">
          このアプリが読み取るのは、カード会社からの請求のお知らせメールだけです。
          メールの本文を保存することはありません。連携を解除すると、
          保存しているアクセス権は削除され、Google 側でも取り消されます。
        </p>
      </div>
    </AppShell>
  );
}
