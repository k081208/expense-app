import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { safeEqual } from "@/lib/crypto";
import {
  checkGmailAccess,
  exchangeCodeForTokens,
  hasGmailReadScope,
  verifyIdToken,
} from "@/lib/gmail/oauth";
import {
  findGmailConnection,
  hasStoredRefreshToken,
  markConnectionStatus,
  saveGmailCredentials,
  upsertGmailConnection,
} from "@/lib/gmail/connections";
import { CONNECTIONS_PATH, OAUTH_COOKIE } from "@/lib/gmail/config";
import type { GmailErrorCode } from "@/lib/gmail/errors";

/**
 * Gmail 連携のコールバック。
 *
 * STEP 3 のログイン用コールバック（/auth/callback）とは別物。
 * こちらはアプリのログイン状態を変えず、外部 Google アカウントへの
 * 認可（Connection）だけを作る。
 *
 * 処理の順序:
 *   1. ログイン中のアプリユーザーを確認する（URL の値は信用しない）
 *   2. state を照合する
 *   3. Google 側のエラーを確認する
 *   4. 認可コードの有無を確認する
 *   5. 認可コードをトークンへ交換する（PKCE の code_verifier を使用）
 *   6. ID トークンを検証する（署名・iss・aud・exp）
 *   7. sub を取り出す
 *   8. メールアドレスを取り出す
 *   9. メールアドレスが確認済みかを見る
 *  10. 付与されたスコープに gmail.readonly があるか確認する
 *  11-13. アクセストークン・リフレッシュトークン・有効期限を受け取る
 *  14. connections へ保存する（同じ Google アカウントなら既存を更新）
 *  15-16. トークンを暗号化して private.oauth_credentials へ保存する
 *  17. 設定画面へ戻る
 */

/** 認証情報を含むレスポンスがキャッシュされないようにする。 */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

/** 途中経過の Cookie は、成功・失敗どちらでも必ず消す。 */
function clearOauthCookies(response: NextResponse): NextResponse {
  for (const name of [OAUTH_COOKIE.state, OAUTH_COOKIE.codeVerifier]) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return response;
}

function backToSettings(origin: string, query: string): NextResponse {
  return clearOauthCookies(
    noStore(NextResponse.redirect(`${origin}${CONNECTIONS_PATH}${query}`)),
  );
}

const fail = (origin: string, code: GmailErrorCode) =>
  backToSettings(origin, `?error=${code}`);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);

  // リバースプロキシ配下でも正しいオリジンへ戻す
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = forwardedHost
    ? `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost}`
    : url.origin;

  // 1. ログイン中のアプリユーザーを確認する。
  //    URL に付いてきた値ではなく、Supabase のセッションから取り直す。
  const user = await getCurrentUser();
  if (!user) return fail(origin, "session_expired");

  // 2. state の照合。Cookie（HttpOnly）に入れた値と一致しなければ中止する。
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_COOKIE.state)?.value ?? "";
  const receivedState = url.searchParams.get("state") ?? "";
  if (!expectedState || !receivedState || !safeEqual(expectedState, receivedState)) {
    logger.warn("Gmail 連携の state が一致しませんでした");
    return fail(origin, "state_mismatch");
  }

  // 3. Google 側でのエラー（同意しなかった場合など）
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    logger.info("Gmail 連携が中断されました", { reason: oauthError });
    return fail(origin, oauthError === "access_denied" ? "access_denied" : "unknown");
  }

  // 4. 認可コードの有無（値そのものはログに出さない）
  const code = url.searchParams.get("code");
  if (!code) return fail(origin, "missing_code");

  const codeVerifier = cookieStore.get(OAUTH_COOKIE.codeVerifier)?.value ?? "";
  if (!codeVerifier) return fail(origin, "state_mismatch");

  // 5. 認可コードをトークンへ交換する
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, codeVerifier });
  } catch {
    return fail(origin, "token_exchange_failed");
  }

  // 10. 付与されたスコープの確認。
  //     利用者が Gmail の閲覧を許可しなかった場合は連携成功にしない。
  if (!hasGmailReadScope(tokens.grantedScopes)) {
    logger.info("Gmail の読み取り権限が付与されませんでした");
    return fail(origin, "missing_gmail_scope");
  }

  // 6-9. ID トークンを検証し、連携先アカウントを特定する
  if (!tokens.idToken) return fail(origin, "id_token_invalid");

  let identity;
  try {
    identity = await verifyIdToken(tokens.idToken);
  } catch {
    return fail(origin, "id_token_invalid");
  }

  if (identity.email && !identity.emailVerified) {
    // 未確認のメールアドレスは表示用として信用しない
    return fail(origin, "email_unverified");
  }

  // リフレッシュトークンの確認。
  //
  // Google は再連携時などに返さないことがある。保存済みがあれば問題ないので、
  // 先に既存の連携を探してから判断する。ここで連携を作ってしまうと、
  // 失敗したのに「連携中」の行が残ってしまうため、保存はこの後に行う。
  const existing = await findGmailConnection({
    userId: user.id,
    externalAccountId: identity.sub,
  });

  if (!tokens.refreshToken && !(existing && (await hasStoredRefreshToken(existing.id)))) {
    logger.warn("リフレッシュトークンを取得できませんでした");
    if (existing) {
      // 既存の連携は「使えない状態」として残す（成功扱いにはしない）
      await markConnectionStatus({
        userId: user.id,
        connectionId: existing.id,
        status: "error",
        errorCode: "missing_refresh_token",
      });
    }
    return fail(origin, "missing_refresh_token");
  }

  // 14. connections への保存（同じ Google アカウントなら既存の id を維持する）
  let connectionId: string;
  let reconnected: boolean;
  try {
    const result = await upsertGmailConnection({
      userId: user.id,
      externalAccountId: identity.sub,
      accountEmail: identity.email,
      scopes: tokens.grantedScopes,
      expiresAt: tokens.expiresAt,
    });
    connectionId = result.connectionId;
    reconnected = result.reconnected;
  } catch {
    return fail(origin, "save_failed");
  }

  /** ここから先の失敗は「連携中」のまま残さない。 */
  const failAfterSave = async (code: GmailErrorCode) => {
    await markConnectionStatus({
      userId: user.id,
      connectionId,
      status: "error",
      errorCode: code,
    });
    return fail(origin, code);
  };

  // 15-16. 暗号化して保存する。
  //        リフレッシュトークンが今回無い場合は null を渡し、保存済みを消さない。
  try {
    await saveGmailCredentials({
      connectionId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  } catch {
    return failAfterSave("save_failed");
  }

  // Gmail API へ実際に届くかだけを確認する（メールの検索や本文取得はしない）
  const reachable = await checkGmailAccess(tokens.accessToken);
  if (!reachable) {
    logger.warn("Gmail API へ接続できませんでした");
    return failAfterSave("gmail_unreachable");
  }

  logger.info("Gmail 連携が完了しました", { reconnected });

  // 17. 設定画面へ戻る
  return backToSettings(origin, reconnected ? "?reconnected=1" : "?connected=1");
}
