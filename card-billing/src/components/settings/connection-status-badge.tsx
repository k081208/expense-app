import type { ConnectionStatus } from "@/types/database";

/**
 * 連携の状態バッジ。
 *
 * 色だけで意味を伝えないよう、必ず日本語の文言を添える。
 */
const LABELS: Record<ConnectionStatus, string> = {
  connected: "連携中",
  expired: "再連携が必要",
  revoked: "解除済み",
  error: "エラー",
};

const STYLES: Record<ConnectionStatus, string> = {
  connected: "bg-brand-soft text-brand",
  expired: "bg-danger/10 text-danger",
  revoked: "bg-surface-muted text-muted",
  error: "bg-danger/10 text-danger",
};

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
