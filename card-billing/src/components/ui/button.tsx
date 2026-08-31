import type { ComponentProps, ReactNode } from "react";

/**
 * ボタンの共通スタイル。
 * スマートフォンでの操作を想定し、高さ 52px 以上のタップ領域を確保する。
 * キーボード操作時にどこにいるか分かるよう、focus-visible のリングを必ず出す。
 */
const BASE =
  "inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-5 " +
  "min-h-[52px] text-base font-semibold transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS = {
  /** 主要な操作。 */
  primary: "bg-brand text-white hover:opacity-90 dark:text-[#0b1020]",
  /** 白地のボタン。Google のログインボタンなどに使う。 */
  surface:
    "border border-border bg-surface text-foreground hover:bg-surface-muted",
  /** 補助的な操作。 */
  quiet: "text-muted hover:bg-surface-muted",
} as const;

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof VARIANTS;
  children: ReactNode;
}) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
