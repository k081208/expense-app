import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requirePublicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * サービスロールキーを使う管理用クライアント。**RLS を迂回する**ため、
 * 自動更新バッチなど「ユーザーのセッションが存在しない処理」でのみ使う。
 *
 * - 必ずサーバー側だけで使うこと（`server-only` で誤 import を防いでいる）
 * - 必ず user_id を明示的に絞り込むこと（RLS の保護が無いため）
 */
export function createAdminClient() {
  const { supabaseUrl } = requirePublicEnv();
  const { supabaseServiceRoleKey } = serverEnv();

  return createSupabaseClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
