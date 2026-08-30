import type { ReactNode } from "react";

/**
 * 画面共通の外枠。
 * スマートフォンでの利用を主に想定し、幅は最大 480px に抑えて中央寄せする。
 * 下端は iPhone のホームインジケータ分の余白を確保する。
 */
export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pt-8 pb-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </header>
      <main className="flex-1 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
