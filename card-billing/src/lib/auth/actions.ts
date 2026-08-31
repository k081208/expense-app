"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/redirect";
import { LOGIN_SCOPES } from "@/lib/auth/scopes";
import { logger } from "@/lib/logger";

/**
 * ログイン・ログアウトの Server Action。
 *
 * フォーム送信で動くため、JavaScript が無効でも操作できる。
 * どちらも通常の Supabase Auth の仕組みだけで完結し、
 * サービスロールキーは一切使わない。
 */

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"));
  const origin = await getAppOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: LOGIN_SCOPES,
    },
  });

  if (error || !data?.url) {
    // Supabase 側で Google プロバイダが未設定の場合などにここへ来る。
    // 詳細（URL・トークン）はログにも画面にも出さない。
    logger.warn("Google ログインを開始できませんでした", { status: error?.status });
    redirect("/login?error=oauth_start_failed");
  }

  // Google の同意画面へ送る
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    logger.warn("ログアウトに失敗しました", { status: error.status });
  }

  redirect("/login");
}
