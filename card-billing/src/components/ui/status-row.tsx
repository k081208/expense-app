/** セットアップ状況などの「項目 + 状態」1 行。 */
export function StatusRow({
  label,
  done,
  hint,
}: {
  label: string;
  done: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
          done
            ? "bg-brand-soft text-brand"
            : "bg-surface-muted text-muted"
        }`}
      >
        {done ? "設定済み" : "未設定"}
      </span>
    </div>
  );
}
