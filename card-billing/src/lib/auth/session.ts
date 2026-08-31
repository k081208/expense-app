import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * ログイン中ユーザーの取得。
 *
 * 認可の最終判定はここで行う。proxy.ts の判定はあくまで前さばき（optimistic check）
 * であり、保護ページは必ず `requireUser()` を通すこと。
 *
 * `getUser()` は Supabase の Auth サーバーへ問い合わせて検証するため、
 * Cookie を書き換えただけでは通過できない。
 */

/** 画面で使うユーザー情報。DB へコピーせず、必要なときに Auth から読む。 */
export type AppUser = {
  id: string;
  email: string | null;
  /** 表示名。Google 側に無ければメールアドレスの左側、それも無ければ "ユーザー"。 */
  displayName: string;
  /** アバター画像の URL。無ければ null。 */
  avatarUrl: string | null;
};

/**
 * user_metadata から表示名を組み立てる。
 * Google アカウントに期待した項目が無くてもエラーにしない。
 */
function toDisplayName(
  metadata: Record<string, unknown> | undefined,
  email: string | null,
): string {
  for (const key of ["full_name", "name", "preferred_username"]) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const local = email?.split("@")[0];
  return local?.trim() ? local : "ユーザー";
}

function toAvatarUrl(metadata: Record<string, unknown> | undefined): string | null {
  for (const key of ["avatar_url", "picture"]) {
    const value = metadata?.[key];
    // 画像として読み込むため、http(s) 以外のスキームは受け付けない
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  return null;
}

/**
 * ログイン中のユーザーを返す。未ログインなら null。
 *
 * 同じリクエスト内で複数回呼んでも Auth サーバーへの問い合わせは 1 回で済むよう、
 * React の `cache()` で結果を共有する。
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    // 未ログインは正常な状態なのでログに残さない。
    // 設定不備や Supabase 側の障害など、それ以外の失敗だけを記録する。
    if (error && !isAuthSessionMissingError(error)) {
      logger.warn("ユーザー情報を取得できませんでした", { status: error.status });
    }
    return null;
  }

  const metadata = data.user.user_metadata as Record<string, unknown> | undefined;
  const email = data.user.email ?? null;

  return {
    id: data.user.id,
    email,
    displayName: toDisplayName(metadata, email),
    avatarUrl: toAvatarUrl(metadata),
  };
});

/**
 * ログイン必須ページで使う。未ログインならログイン画面へ送る。
 * @param returnTo ログイン後に戻したいパス（内部パスのみ）
 */
export async function requireUser(returnTo?: string): Promise<AppUser> {
  const user = await getCurrentUser();
  if (user) return user;

  const query = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
  redirect(`/login${query}`);
}
