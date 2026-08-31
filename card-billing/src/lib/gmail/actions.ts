"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  buildAuthorizationUrl,
  createPkcePair,
  createState,
} from "./oauth";
import { disconnectGmailConnection } from "./tokens";
import {
  CONNECTIONS_PATH,
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
} from "./config";

/**
 * Gmail 連携の操作（Server Action）。
 *
 * ログイン（STEP 3）とは完全に別の仕組み。Supabase Auth の signInWithOAuth や
 * linkIdentity は使わず、Google の認可コードフローを自前で開始する。
 */

/** Gmail 連携を開始する。Google の同意画面へ送る。 */
export async function startGmailConnection(): Promise<void> {
  await requireUser();

  const state = createState();
  const { verifier, challenge } = createPkcePair();

  // state と code_verifier は HttpOnly の Cookie に短時間だけ置く。
  // JavaScript から読めず、コールバックで照合したら削除する。
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };
  cookieStore.set(OAUTH_COOKIE.state, state, options);
  cookieStore.set(OAUTH_COOKIE.codeVerifier, verifier, options);

  let authorizationUrl: string;
  try {
    authorizationUrl = buildAuthorizationUrl({ state, codeChallenge: challenge });
  } catch {
    // 環境変数が未設定の場合など
    logger.warn("Gmail 連携を開始できませんでした（設定不足）");
    redirect(`${CONNECTIONS_PATH}?error=not_configured`);
  }

  redirect(authorizationUrl);
}

/** Gmail 連携を解除する。連携の行は残し、状態と保存済みトークンだけを処理する。 */
export async function disconnectGmail(formData: FormData): Promise<void> {
  const user = await requireUser();
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) return;

  // 所有者の確認は disconnectGmailConnection の中でも user_id で絞っている
  await disconnectGmailConnection({ userId: user.id, connectionId });

  revalidatePath(CONNECTIONS_PATH);
  redirect(`${CONNECTIONS_PATH}?disconnected=1`);
}

/**
 * カードの請求メール取得元を設定する。
 *
 * 通常のユーザーセッション（RLS）で操作する。user_id はフォームから受け取らず、
 * 認証済みユーザーから決める。
 * 1 枚のカードにつき Gmail は 1 つなので、切り替えは行の追加ではなく更新で行う。
 */
export async function assignGmailToCard(formData: FormData): Promise<void> {
  const user = await requireUser();

  const cardId = String(formData.get("cardId") ?? "");
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!cardId) return;

  const supabase = await createClient();

  // 「未設定」を選んだ場合は割り当てを消す
  if (!connectionId) {
    await supabase
      .from("card_connection_assignments")
      .delete()
      .eq("card_id", cardId)
      .eq("source", "gmail");

    revalidatePath(CONNECTIONS_PATH);
    return;
  }

  // 既存があれば付け替え、無ければ作成する。
  // 他人のカード・他人の連携は RLS と複合外部キーの両方で弾かれる。
  const { data: existing } = await supabase
    .from("card_connection_assignments")
    .select("id")
    .eq("card_id", cardId)
    .eq("source", "gmail")
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("card_connection_assignments")
        .update({ connection_id: connectionId })
        .eq("id", existing.id)
    : await supabase.from("card_connection_assignments").insert({
        user_id: user.id,
        card_id: cardId,
        connection_id: connectionId,
        source: "gmail",
      });

  if (error) {
    logger.warn("取得元を設定できませんでした", { code: error.code });
  }

  revalidatePath(CONNECTIONS_PATH);
  revalidatePath("/");
}
