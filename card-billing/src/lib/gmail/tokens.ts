import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import {
  GoogleOAuthError,
  refreshAccessToken,
  revokeToken,
} from "./oauth";
import {
  markConnectionStatus,
  saveGmailCredentials,
} from "./connections";
import { ACCESS_TOKEN_REFRESH_MARGIN_SECONDS } from "./config";

/**
 * 有効な Google アクセストークンを返すサーバー専用ヘルパ。
 *
 *   保存済みの暗号文を取得
 *     → 復号
 *     → 期限を確認
 *         まだ余裕がある → そのまま返す
 *         期限切れ・間近 → リフレッシュトークンで更新 → 暗号化して保存 → 返す
 *
 * STEP 8 以降の取得処理は、この関数だけを使えばよい。
 * 呼び出し側は必ず認証済みユーザーの id を渡すこと（他人の連携を扱わせない）。
 */

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; code: "not_connected" | "token_expired" | "upstream_error" };

export async function getValidGoogleAccessToken(params: {
  /** 認証済みユーザーの id。ブラウザから来た値は使わない。 */
  userId: string;
  connectionId: string;
  /** 期限判定の基準時刻。テストで固定できるようにしている。 */
  now?: Date;
}): Promise<AccessTokenResult> {
  const now = params.now ?? new Date();
  const admin = createAdminClient();

  // 所有者の確認（サービスロールは RLS を迂回するため、ここで必ず絞る）
  const { data: connection } = await admin
    .from("connections")
    .select("id, user_id")
    .eq("id", params.connectionId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!connection) return { ok: false, code: "not_connected" };

  const { data: rows, error } = await admin.rpc("oauth_credentials_get", {
    p_connection_id: params.connectionId,
  });
  const stored = rows?.[0];

  if (error || !stored) {
    return { ok: false, code: "not_connected" };
  }

  // まだ余裕があるならそのまま使う
  const expiresAt = stored.access_token_expires_at
    ? new Date(stored.access_token_expires_at).getTime()
    : 0;
  const margin = ACCESS_TOKEN_REFRESH_MARGIN_SECONDS * 1000;

  if (expiresAt - margin > now.getTime()) {
    try {
      return { ok: true, accessToken: decryptToken(stored.access_token_encrypted) };
    } catch {
      logger.warn("保存済みアクセストークンを復号できませんでした");
      // 復号できない場合は更新に回す
    }
  }

  if (!stored.refresh_token_encrypted) {
    // 更新手段が無い。再連携が必要。
    await markConnectionStatus({
      userId: params.userId,
      connectionId: params.connectionId,
      status: "expired",
      errorCode: "token_expired",
    });
    return { ok: false, code: "token_expired" };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(stored.refresh_token_encrypted);
  } catch {
    logger.warn("保存済みリフレッシュトークンを復号できませんでした");
    return { ok: false, code: "upstream_error" };
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);

    // Google は更新時に新しいリフレッシュトークンを返さないことがある。
    // その場合は null を渡し、保存済みの値を消さないようにする。
    await saveGmailCredentials({
      connectionId: params.connectionId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    });

    await markConnectionStatus({
      userId: params.userId,
      connectionId: params.connectionId,
      status: "connected",
      errorCode: null,
    });

    return { ok: true, accessToken: refreshed.accessToken };
  } catch (e) {
    const code = e instanceof GoogleOAuthError ? e.code : "unknown";

    // invalid_grant は、取り消し・失効などで二度と使えない状態。再連携が必要。
    if (code === "invalid_grant") {
      await markConnectionStatus({
        userId: params.userId,
        connectionId: params.connectionId,
        status: "expired",
        errorCode: "token_expired",
      });
      return { ok: false, code: "token_expired" };
    }

    await markConnectionStatus({
      userId: params.userId,
      connectionId: params.connectionId,
      status: "error",
      errorCode: "upstream_error",
    });
    return { ok: false, code: "upstream_error" };
  }
}

/**
 * 連携を解除する。
 *
 * 連携の行そのものは残し、状態を revoked にしてトークンだけを削除する。
 * こうしておくと、同じ Google アカウントで再連携したときに
 * カードごとの割り当てをやり直さずに復帰できる（STEP 6.5 の設計）。
 */
export async function disconnectGmailConnection(params: {
  userId: string;
  connectionId: string;
}): Promise<{ revokedAtGoogle: boolean }> {
  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("connections")
    .select("id")
    .eq("id", params.connectionId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!connection) return { revokedAtGoogle: false };

  // Google 側でもトークンを取り消す（できなくても手元の削除は続ける）
  let revokedAtGoogle = false;
  const { data: rows } = await admin.rpc("oauth_credentials_get", {
    p_connection_id: params.connectionId,
  });
  const stored = rows?.[0];

  if (stored) {
    const encrypted = stored.refresh_token_encrypted ?? stored.access_token_encrypted;
    try {
      revokedAtGoogle = await revokeToken(decryptToken(encrypted));
    } catch {
      revokedAtGoogle = false;
    }
  }

  // 手元のトークンは必ず削除する
  await admin.rpc("oauth_credentials_delete", { p_connection_id: params.connectionId });

  await admin
    .from("connections")
    .update({ status: "revoked", expires_at: null, last_error_code: null })
    .eq("id", params.connectionId)
    .eq("user_id", params.userId);

  logger.info("Gmail 連携を解除しました", { revokedAtGoogle });
  return { revokedAtGoogle };
}
