import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requirePublicEnv } from "@/lib/env";

/**
 * Server Component / Server Action / Route Handler 用の Supabase クライアント。
 *
 * anon key を使うため RLS が効き、ログイン中ユーザー自身のデータしか読み書きできない。
 * Next.js 16 では `cookies()` が非同期のため await して使う。
 */
export async function createClient() {
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からは Cookie を書けない。
          // セッションの更新は proxy.ts 側で行うため、ここでは無視してよい。
        }
      },
    },
  });
}
