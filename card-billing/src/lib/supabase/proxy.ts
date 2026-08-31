import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requirePublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * proxy.ts（Next.js 16 でミドルウェアから名称変更）から呼ぶセッション更新処理。
 *
 * アクセストークンの期限が近ければ更新し、新しい Cookie をレスポンスへ書き戻す。
 * これを毎リクエストで通しておかないと、期限切れのたびにログアウトしてしまう。
 *
 * 判定に使うのは `getClaims()`。@supabase/ssr が現在推奨している方法で、
 * JWT を検証しつつ必要ならセッションを更新する（`getSession()` と違い、
 * Cookie の中身をそのまま信用しない）。
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  /** ログイン中なら auth.users.id、未ログインなら null。 */
  userId: string | null;
}> {
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();

  // 更新後の Cookie を、このリクエストの後続処理（Server Components）からも
  // 見えるようにするため、リクエストヘッダも一緒に差し替える。
  const requestHeaders = new Headers(request.headers);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        requestHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // 認証 Cookie を含むレスポンスがキャッシュされないようにするヘッダ。
        // 別のユーザーへセッションが配られる事故を防ぐ。
        for (const [key, value] of Object.entries(headersToSet)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;

  return { response, userId: typeof sub === "string" ? sub : null };
}

/**
 * リダイレクトする場合でも、更新された認証 Cookie は失わずに引き継ぐ。
 */
export function redirectKeepingCookies(
  source: NextResponse,
  url: URL,
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}
