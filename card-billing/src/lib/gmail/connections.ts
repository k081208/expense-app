import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, CURRENT_KEY_VERSION } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import type {
  CardConnectionAssignmentRow,
  ConnectionRow,
} from "@/types/database";

/**
 * Gmail 連携（connections）の読み書き。
 *
 * 【サービスロールの扱い】
 * 連携の作成とトークンの保存は、RLS ではクライアントに許可していない操作なので
 * サービスロールで行う。サービスロールは RLS を迂回できるため、
 * **必ず呼び出し側で認証済みユーザーの id を渡し、その id 以外は触らない**。
 * ブラウザから来た connection_id をそのまま信用して更新することはしない。
 */

/** 連携を作った・更新した結果。 */
export type UpsertConnectionResult = {
  connectionId: string;
  /** 既存の連携を再利用したか（新規作成ではないか）。 */
  reconnected: boolean;
};

/** ログイン中ユーザーの Gmail 連携一覧（RLS 経由。秘密情報は含まれない）。 */
export async function listGmailConnections(): Promise<ConnectionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("kind", "gmail")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * 同じ Google アカウント（sub）の既存連携を探す。見つからなければ null。
 *
 * サービスロールを使うため、user_id を必ず条件に含める。
 */
export async function findGmailConnection(params: {
  userId: string;
  externalAccountId: string;
}): Promise<{ id: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("connections")
    .select("id")
    .eq("user_id", params.userId)
    .eq("kind", "gmail")
    .eq("provider_key", "google")
    .eq("external_account_id", params.externalAccountId)
    .maybeSingle();

  return data ?? null;
}

/**
 * 連携を作成、または同じ Google アカウントの既存連携を更新する。
 *
 * 同じ user_id / kind / provider_key / external_account_id の連携が既にあれば
 * **id を変えずに更新**する。削除して作り直すと、カードごとの割り当てが
 * 失われてしまうため。
 */
export async function upsertGmailConnection(params: {
  /** 認証済みユーザーの id。ブラウザから受け取った値は使わない。 */
  userId: string;
  externalAccountId: string;
  accountEmail: string | null;
  scopes: string[];
  expiresAt: string | null;
}): Promise<UpsertConnectionResult> {
  const admin = createAdminClient();

  const existing = await findGmailConnection({
    userId: params.userId,
    externalAccountId: params.externalAccountId,
  });

  const values = {
    status: "connected" as const,
    account_email: params.accountEmail,
    scopes: params.scopes,
    connected_at: new Date().toISOString(),
    expires_at: params.expiresAt,
    last_error_code: null,
  };

  if (existing) {
    // 再接続。id を維持するので、カードごとの割り当てはそのまま使える。
    const { error } = await admin
      .from("connections")
      .update(values)
      .eq("id", existing.id)
      .eq("user_id", params.userId);

    if (error) {
      logger.warn("連携を更新できませんでした", { code: error.code });
      throw error;
    }
    return { connectionId: existing.id, reconnected: true };
  }

  const { data: created, error } = await admin
    .from("connections")
    .insert({
      user_id: params.userId,
      kind: "gmail",
      provider_key: "google",
      external_account_id: params.externalAccountId,
      ...values,
    })
    .select("id")
    .single();

  if (error || !created) {
    logger.warn("連携を作成できませんでした", { code: error?.code });
    throw error ?? new Error("connection insert failed");
  }
  return { connectionId: created.id, reconnected: false };
}

/**
 * トークンを暗号化して保存する。
 *
 * リフレッシュトークンは Google が返さないことがある。その場合は
 * 保存済みの値を消さないよう、null を渡して RPC 側の coalesce に任せる。
 */
export async function saveGmailCredentials(params: {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.rpc("oauth_credentials_upsert", {
    p_connection_id: params.connectionId,
    p_access_token_encrypted: encryptToken(params.accessToken),
    p_refresh_token_encrypted: params.refreshToken
      ? encryptToken(params.refreshToken)
      : null,
    p_access_token_expires_at: params.expiresAt,
    p_key_version: CURRENT_KEY_VERSION,
  });

  if (error) {
    logger.warn("トークンを保存できませんでした", { code: error.code });
    throw error;
  }
}

/** 連携が保存済みのリフレッシュトークンを持っているか。 */
export async function hasStoredRefreshToken(connectionId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("oauth_credentials_get", {
    p_connection_id: connectionId,
  });
  if (error) return false;
  return Boolean(data?.[0]?.refresh_token_encrypted);
}

/**
 * 連携の状態を更新する。
 * サービスロールを使うため、user_id を必ず条件に含めて他人の行に触れないようにする。
 */
export async function markConnectionStatus(params: {
  userId: string;
  connectionId: string;
  status: "connected" | "expired" | "revoked" | "error";
  errorCode?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("connections")
    .update({
      status: params.status,
      last_error_code: params.errorCode ?? null,
    })
    .eq("id", params.connectionId)
    .eq("user_id", params.userId);

  if (error) logger.warn("連携の状態を更新できませんでした", { code: error.code });
}

/** 連携が本人のものか確認する。サービスロールで操作する前に必ず通す。 */
export async function assertOwnedConnection(
  userId: string,
  connectionId: string,
): Promise<ConnectionRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/**
 * ログイン中ユーザーの「カード → 取得元」の割り当て一覧（RLS 経由）。
 *
 * 設定画面で、各カードにどの Gmail アカウントが選ばれているかを表示するために使う。
 */
export async function listGmailAssignments(): Promise<
  CardConnectionAssignmentRow[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("card_connection_assignments")
    .select("*")
    .eq("source", "gmail");

  if (error) throw error;
  return data ?? [];
}

/** カード id → 割り当て済み connection id の対応表。未設定のカードは含まれない。 */
export function assignmentMap(
  assignments: CardConnectionAssignmentRow[],
): Map<string, string> {
  return new Map(assignments.map((a) => [a.card_id, a.connection_id]));
}
