import "server-only";

import { headers } from "next/headers";

/**
 * アプリ自身の URL（オリジン）を求める。
 *
 * OAuth のリダイレクト先を組み立てるのに使う。
 *
 * 1. `NEXT_PUBLIC_APP_URL` が設定されていればそれを使う（本番で確実にするため）
 * 2. 無ければリクエストのホストから組み立てる（ローカル開発やプレビュー環境向け）
 *
 * ホストヘッダは書き換えられうるが、リダイレクト先は Supabase 側の
 * Redirect URLs に登録されたものだけが許可されるため、ここだけで
 * 任意の URL へ飛ばすことはできない。
 */
export async function getAppOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return host ? `${proto}://${host}` : "http://localhost:3000";
}
