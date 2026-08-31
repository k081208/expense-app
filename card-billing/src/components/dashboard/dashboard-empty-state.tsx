import { Button } from "@/components/ui/button";

/**
 * カードが 1 枚も登録されていないときの表示。
 *
 * カード登録機能は STEP 5 で実装するため、ここでは存在しないページへ
 * 遷移させない。ボタンは無効のまま置き、STEP 5 で action を渡すだけで
 * 動くようにしておく。
 */
export function DashboardEmptyState() {
  return (
    <section
      aria-labelledby="empty-state-heading"
      className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center shadow-sm"
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="mx-auto text-muted"
      >
        <rect
          x="4.5"
          y="10.5"
          width="31"
          height="20"
          rx="3.5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path d="M5 17h30" stroke="currentColor" strokeWidth="1.6" />
        <rect x="9" y="22" width="7" height="4" rx="1" fill="currentColor" opacity="0.5" />
      </svg>

      <h2 id="empty-state-heading" className="mt-4 text-base font-semibold">
        カードがまだ登録されていません
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        カードを登録すると、次回の支払予定をここでまとめて確認できます。
      </p>

      <div className="mt-5">
        <Button type="button" disabled aria-describedby="empty-state-note">
          カードを登録
        </Button>
        <p id="empty-state-note" className="mt-2 text-xs text-muted">
          カード登録は次のステップで利用できるようになります。
        </p>
      </div>
    </section>
  );
}
