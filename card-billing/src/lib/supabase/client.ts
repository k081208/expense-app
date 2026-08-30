"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicEnv } from "@/lib/env";

/**
 * ブラウザ用 Supabase クライアント。
 * anon key と RLS の組み合わせで、ログイン中ユーザー自身の行だけにアクセスできる。
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
