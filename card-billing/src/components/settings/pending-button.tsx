"use client";

import { useFormStatus } from "react-dom";

/**
 * 送信中は押せなくなるボタン。
 *
 * 連携の開始・解除・取得元の保存に使う。JavaScript が無効でも
 * ただのフォーム送信ボタンとして動く（表示が変わらないだけ）。
 */
export function PendingButton({
  children,
  pendingLabel,
  className = "",
  variant = "quiet",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  variant?: "primary" | "quiet";
}) {
  const { pending } = useFormStatus();

  const base =
    "inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 " +
    "text-sm font-semibold transition-colors focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-background";

  // 無効時は色を薄めず配色ごと差し替える（薄めるとダークモードで読めなくなるため）
  const tone = pending
    ? "cursor-not-allowed border border-border text-muted"
    : variant === "primary"
      ? "bg-brand text-white hover:opacity-90 dark:text-[#0b1020]"
      : "border border-border text-foreground hover:bg-surface-muted";

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${base} ${tone} ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
