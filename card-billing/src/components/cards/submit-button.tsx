"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * 送信中は押せなくなる送信ボタン。
 * 連打で同じカードが複数登録されるのを防ぐ。
 * （JavaScript が無効な場合に備えて、サーバー側でも直前の同一内容を弾いている）
 */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "保存しています…" : children}
    </Button>
  );
}
