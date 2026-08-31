import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";
import type { AuthErrorCode } from "@/lib/auth/errors";
import { logger } from "@/lib/logger";

/**
 * Google 認証後のコールバック。
 *
 *   Google から code を受け取る
 *     -> Supabase のセッションへ交換する（PKCE）
 *     -> セッション Cookie が書き込まれる
 *     -> ログイン後の画面へ戻す
 *
 * PKCE の検証は @supabase/ssr と Supabase Auth の正規のフローに任せている。
 * 独自の OAuth 処理は書かない。
 */

/** 認証 Cookie を含むレスポンスがキャッシュされないようにする。 */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function toLogin(origin: string, code: AuthErrorCode): NextResponse {
  return noStore(NextResponse.redirect(`${origin}/login?error=${code}`));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);

  // リバースプロキシ配下（Vercel など）でも正しいオリジンへ戻す
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = forwardedHost
    ? `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost}`
    : url.origin;

  // 遷移先は必ず内部パスへ丸める（オープンリダイレクト対策）
  const next = safeNextPath(url.searchParams.get("next"));

  // Google 側でキャンセル・拒否された場合
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    logger.info("OAuth が中断されました", { reason: oauthError });
    return toLogin(origin, oauthError === "access_denied" ? "cancelled" : "unknown");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    // code の値そのものはログに出さない
    logger.warn("OAuth コールバックに認可コードがありません");
    return toLogin(origin, "missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // エラーメッセージには code やトークンが含まれうるため、状態だけを記録する
    logger.warn("セッションへの交換に失敗しました", { status: error.status });
    return toLogin(origin, "exchange_failed");
  }

  return noStore(NextResponse.redirect(`${origin}${next}`));
}
