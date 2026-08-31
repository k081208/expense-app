import Link from "next/link";

/** カードが 1 枚も登録されていないときの表示。 */
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
        <Link
          href="/cards/new"
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-5 text-base font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-[#0b1020]"
        >
          カードを登録
        </Link>
      </div>
    </section>
  );
}
