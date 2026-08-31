import { NextResponse, type NextRequest } from "next/server";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { redirectKeepingCookies, updateSession } from "@/lib/supabase/proxy";

/**
 * Proxy（Next.js 16 で middleware から名称変更。実行ランタイムは Node.js）。
 *
 * ここでやること:
 *   1. Supabase Auth のセッション Cookie を更新する
 *   2. 未ログインで保護ページを開いたらログイン画面へ送る（前さばき）
 *   3. ログイン済みでログイン画面を開いたらトップへ送る
 *
 * 2 はあくまで前さばきで、認可の最終判定ではない。
 * 保護ページ側で必ず `requireUser()`（Auth サーバーで検証）を通している。
 * Next.js の公式ガイドも、proxy では Cookie の確認までに留め、
 * 本来の認可判定はページ側で行うことを推奨している。
 */

/** ログインしていなくても開けるパス。 */
const PUBLIC_PATHS = ["/login"];

/** OAuth のコールバック。ログイン処理そのものなので判定の対象外。 */
const AUTH_PATHS = ["/auth/"];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    AUTH_PATHS.some((prefix) => pathname.startsWith(prefix))
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // 環境変数が未設定のときはセットアップ画面を出したいので、
  // ここでは何もせず通す（設定漏れでアプリ全体が開けなくなるのを避ける）。
  if (!hasPublicSupabaseEnv()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  let session: Awaited<ReturnType<typeof updateSession>>;
  try {
    session = await updateSession(request);
  } catch {
    // Supabase へ接続できない場合でも、アプリ全体が使えなくならないように通す。
    // 保護ページ側の requireUser() が未ログインとして扱う。
    return NextResponse.next();
  }

  const { response, userId } = session;

  if (!userId && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.nextUrl);
    // ログイン後に元のページへ戻れるようにする（値は safeNextPath で再検証される）
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return redirectKeepingCookies(response, loginUrl);
  }

  if (userId && pathname === "/login") {
    return redirectKeepingCookies(response, new URL("/", request.nextUrl));
  }

  return response;
}

export const config = {
  /**
   * 静的ファイルや画像には認証処理を通さない。
   * （毎リクエストで Supabase へ問い合わせる必要がないため）
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)",
  ],
};
