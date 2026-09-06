import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  GMAIL_SCOPES,
  GOOGLE_ENDPOINTS,
  GOOGLE_ISSUERS,
  REQUIRED_GMAIL_SCOPE,
} from "./config";

/**
 * Google OAuth 2.0（サーバーサイドの認可コードフロー）。
 *
 * ブラウザだけで完結させない。認可コードとトークンの交換、ID トークンの検証は
 * すべてサーバー側で行い、クライアントシークレットをブラウザへ出さない。
 */

// -----------------------------------------------------------------------------
// state と PKCE
// -----------------------------------------------------------------------------

/** 暗号学的に安全な乱数から state を作る。 */
export function createState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * PKCE の code_verifier と code_challenge を作る。
 * Google のサーバーサイドフローでも PKCE を併用でき、認可コードの横取りを防げる。
 */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString("base64url"); // 43〜128 文字に収まる
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// -----------------------------------------------------------------------------
// 認可 URL
// -----------------------------------------------------------------------------

export function buildAuthorizationUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
  const { gmailClientId, gmailRedirectUri } = serverEnv();

  const url = new URL(GOOGLE_ENDPOINTS.authorize);
  url.searchParams.set("client_id", gmailClientId);
  url.searchParams.set("redirect_uri", gmailRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("state", params.state);

  // 画面を開いていないときにも更新できるよう、リフレッシュトークンを受け取る
  url.searchParams.set("access_type", "offline");

  // 複数の Google アカウントを繋ぐため、毎回どのアカウントかを選ばせる。
  // あわせて同意も取り直すことで、リフレッシュトークンが返らない事態を避ける。
  url.searchParams.set("prompt", "select_account consent");

  // include_granted_scopes は付けない（既定の false）。
  // これは「後から権限を追加していく」ための仕組み（incremental authorization）で、
  // 付けると同じ Google Cloud プロジェクトで別の目的（ログイン）に許可された
  // profile などの権限までトークンに合算される。この連携は openid / email /
  // gmail.readonly の 3 つに固定する用途なので、要求したものだけを受け取る。

  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

// -----------------------------------------------------------------------------
// トークンの取得・更新
// -----------------------------------------------------------------------------

export type GoogleTokenResponse = {
  accessToken: string;
  /** Google は再連携時などに返さないことがある。 */
  refreshToken: string | null;
  /** アクセストークンの有効期限（ISO 8601）。 */
  expiresAt: string | null;
  /** 実際に付与されたスコープ。 */
  grantedScopes: string[];
  idToken: string | null;
};

class GoogleOAuthError extends Error {
  /** Google が返した error の値（invalid_grant など）。本文は持ち回らない。 */
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "GoogleOAuthError";
    this.code = code;
  }
}

export { GoogleOAuthError };

function toTokenResponse(payload: Record<string, unknown>): GoogleTokenResponse {
  const expiresIn = Number(payload.expires_in);
  return {
    accessToken: String(payload.access_token),
    refreshToken:
      typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: Number.isFinite(expiresIn)
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
    grantedScopes:
      typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
    idToken: typeof payload.id_token === "string" ? payload.id_token : null,
  };
}

/**
 * Google のトークンエンドポイントを呼ぶ。
 * 失敗時は Google の生のエラー本文を持ち回らず、error コードだけを扱う。
 */
async function postToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_ENDPOINTS.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : "token_request_failed";
    // 認可コードやトークンは記録しない。分類できる情報だけ残す。
    logger.warn("Google のトークン取得に失敗しました", {
      status: response.status,
      code,
    });
    throw new GoogleOAuthError(code);
  }

  return toTokenResponse(payload);
}

/** 認可コードをトークンへ交換する。 */
export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const { gmailClientId, gmailClientSecret, gmailRedirectUri } = serverEnv();

  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: gmailClientId,
      client_secret: gmailClientSecret,
      redirect_uri: gmailRedirectUri,
      code_verifier: params.codeVerifier,
    }),
  );
}

/** リフレッシュトークンから新しいアクセストークンを得る。 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const { gmailClientId, gmailClientSecret } = serverEnv();

  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: gmailClientId,
      client_secret: gmailClientSecret,
    }),
  );
}

/**
 * Google 側でトークンを取り消す。
 * 失敗しても連携解除そのものは続行する（こちらの保存分は必ず消す）。
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_ENDPOINTS.revoke, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// ID トークンの検証
// -----------------------------------------------------------------------------

// Google の公開鍵。取得結果はライブラリ側で保持され、鍵の入れ替えにも追従する。
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_ENDPOINTS.jwks));

export type GoogleIdentity = {
  /** 連携先アカウントの安定した一意 ID。 */
  sub: string;
  email: string | null;
  emailVerified: boolean;
};

/**
 * ID トークンを検証して、連携先アカウントの情報を取り出す。
 *
 * 単に Base64 を復号して中身を信用することはしない。
 *   - 署名（Google の公開鍵で検証）
 *   - 発行者 iss
 *   - 宛先 aud（このアプリのクライアント ID）
 *   - 有効期限 exp
 * をすべて検証する。
 */
export async function verifyIdToken(idToken: string): Promise<GoogleIdentity> {
  const { gmailClientId } = serverEnv();

  let payload;
  try {
    const verified = await jwtVerify(idToken, googleJwks, {
      issuer: [...GOOGLE_ISSUERS],
      audience: gmailClientId,
      algorithms: ["RS256"],
    });
    payload = verified.payload;
  } catch {
    // 例外の内容にトークンが含まれうるため、そのままは記録しない
    logger.warn("Google の ID トークンを検証できませんでした");
    throw new GoogleOAuthError("id_token_invalid");
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new GoogleOAuthError("id_token_invalid");

  const email = typeof payload.email === "string" ? payload.email : null;
  const emailVerified = payload.email_verified === true;

  return { sub, email, emailVerified };
}

/** 付与されたスコープに Gmail の読み取り権限が含まれているか。 */
export function hasGmailReadScope(grantedScopes: string[]): boolean {
  return grantedScopes.includes(REQUIRED_GMAIL_SCOPE);
}

/**
 * このトークンで Gmail API へアクセスできるかだけを確認する。
 * メールの検索も本文の取得も行わない（それは STEP 8）。
 */
export async function checkGmailAccess(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_ENDPOINTS.gmailProfile, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
