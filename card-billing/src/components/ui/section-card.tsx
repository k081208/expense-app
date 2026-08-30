import type { ReactNode } from "react";

/** 余白を大きく取った白い面。情報のかたまりごとに使う。 */
export function SectionCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      {title ? (
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
