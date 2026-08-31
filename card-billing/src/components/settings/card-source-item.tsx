import { assignGmailToCard } from "@/lib/gmail/actions";
import { providerLabel } from "@/lib/cards/catalog";
import { formatLastFour } from "@/lib/format";
import { PendingButton } from "./pending-button";
import type { CardRow, ConnectionRow } from "@/types/database";

/**
 * カード 1 枚の「請求メールの取得元」を選ぶ行。
 *
 * JavaScript が無くても動くよう、選択と保存ボタンを持つ普通のフォームにしている。
 * カード 1 枚につき Gmail は 1 つ。「未設定」を選べば割り当てを外せる。
 */

/** 連携中でないアカウントは、選んだ理由が分かるよう状態を添えて示す。 */
function optionLabel(connection: ConnectionRow): string {
  const name = connection.account_email ?? "Gmail アカウント";
  switch (connection.status) {
    case "connected":
      return name;
    case "expired":
      return `${name}（再連携が必要）`;
    case "revoked":
      return `${name}（解除済み）`;
    case "error":
      return `${name}（エラー）`;
  }
}

export function CardSourceItem({
  card,
  connections,
  selectedConnectionId,
}: {
  card: CardRow;
  connections: ConnectionRow[];
  selectedConnectionId: string | null;
}) {
  const selectId = `card-source-${card.id}`;
  const lastFour = formatLastFour(card.last_four);

  return (
    <li className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold break-words">
            {card.display_name}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {providerLabel(card.provider_key)}
            {lastFour ? ` ・ ${lastFour}` : ""}
          </p>
        </div>
        {card.enabled ? null : (
          <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
            使用しない
          </span>
        )}
      </div>

      <form action={assignGmailToCard} className="mt-4 space-y-2">
        <input type="hidden" name="cardId" value={card.id} />

        <label htmlFor={selectId} className="block text-sm font-medium">
          請求メールの取得元
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id={selectId}
            name="connectionId"
            defaultValue={selectedConnectionId ?? ""}
            className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">未設定</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {optionLabel(connection)}
              </option>
            ))}
          </select>

          <PendingButton pendingLabel="保存しています…">
            保存
            <span className="sr-only">（{card.display_name}の取得元）</span>
          </PendingButton>
        </div>
      </form>
    </li>
  );
}
