import { requireUser } from "@/lib/auth/session";

/**
 * ログインが必須の領域。
 *
 * 認可の最終判定はここで行う。proxy.ts の判定は前さばきに過ぎないため、
 * このレイアウト配下のページは必ず `requireUser()`（Auth サーバーで検証）
 * を通ってから描画される。
 *
 * STEP 4 以降のダッシュボード・カード登録・設定もこの配下に置く。
 */
export default async function AppLayout({
  children,
}: LayoutProps<"/">) {
  await requireUser();
  return <>{children}</>;
}
