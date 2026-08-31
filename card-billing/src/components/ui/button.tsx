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
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const VARIANTS = {
  /** 主要な操作。 */
  primary: "bg-brand text-white hover:opacity-90 dark:text-[#0b1020]",
  /** 白地のボタン。Google のログインボタンなどに使う。 */
  surface:
    "border border-border bg-surface text-foreground hover:bg-surface-muted",
  /**
   * 補助的な操作。塗りを持たないことで主要ボタンと差をつける。
   * 文字色は薄くしない（ダークモードでコントラストが基準を下回るため）。
   */
  quiet: "border border-border text-foreground hover:bg-surface-muted",
} as const;

/**
 * 無効時は変種の色を薄めるのではなく、専用の配色へ差し替える。
 * 薄めるだけではダークモードで文字が読み取りにくくなるため。
 * 塗りを持たせないことで、押せるボタンより目立たないようにしている。
 */
const DISABLED = "cursor-not-allowed border border-border text-muted";

export function Button({
  variant = "primary",
  className = "",
  disabled = false,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof VARIANTS;
  children: ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      className={`${BASE} ${disabled ? DISABLED : VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
