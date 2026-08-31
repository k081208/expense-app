import { disconnectGmail } from "@/lib/gmail/actions";
import { formatLastUpdated } from "@/lib/format";
import { ConnectionStatusBadge } from "./connection-status-badge";
import { PendingButton } from "./pending-button";
import type { ConnectionRow } from "@/types/database";

/**
 * 連携中の Gmail アカウント 1 件。
 *
 * 表示するのは「どのアカウントか」「状態」「いつ繋いだか」「最後に取得したのはいつか」
 * だけ。トークンやその一部を画面へ出すことはしない。
 */
export function ConnectionItem({
  connection,
  assignedCount,
  now,
}: {
  connection: ConnectionRow;
  /** この連携を取得元にしているカードの枚数。 */
  assignedCount: number;
  now?: Date;
}) {
  const isRevoked = connection.status === "revoked";

  return (
    <li className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold break-all">
            {connection.account_email ?? "Gmail アカウント"}
          </h3>
          <p className="mt-0.5 text-xs text-muted">Gmail（請求メールの取得元）</p>
        </div>
        <ConnectionStatusBadge status={connection.status} />
      </div>

      <dl className="mt-3 space-y-1 text-sm text-muted">
        <div className="flex gap-2">
          <dt className="shrink-0">連携日時</dt>
          <dd>{formatLastUpdated(connection.connected_at, now)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0">最終取得</dt>
          <dd>{formatLastUpdated(connection.last_synced_at, now)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0">対象カード</dt>
          <dd>{assignedCount > 0 ? `${assignedCount} 枚` : "未割り当て"}</dd>
        </div>
      </dl>

      {connection.status === "expired" ? (
        <p className="mt-3 text-xs leading-relaxed text-danger">
          Google 側で権限が失効しています。「Gmail アカウントを追加」から
          同じアカウントを選び直すと、カードの割り当てを保ったまま復帰できます。
        </p>
      ) : null}

      {isRevoked ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          連携を解除済みです。カードごとの取得元の設定は残しているため、
          もう一度同じアカウントを繋ぐとそのまま使えます。
        </p>
      ) : (
        <form action={disconnectGmail} className="mt-4">
          <input type="hidden" name="connectionId" value={connection.id} />
          <PendingButton pendingLabel="解除しています…">
            連携を解除
            <span className="sr-only">
              （{connection.account_email ?? "このアカウント"}）
            </span>
          </PendingButton>
        </form>
      )}
    </li>
  );
}
