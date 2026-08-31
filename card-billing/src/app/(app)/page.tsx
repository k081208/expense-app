import { Dashboard } from "@/components/dashboard/dashboard";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getDashboardCards } from "@/lib/dashboard/data";
import { summarizeDashboard } from "@/lib/dashboard/summary";

/** セッションとデータの状態で表示が変わるため、ビルド時に固定しない。 */
export const dynamic = "force-dynamic";

/**
 * ダッシュボード。
 *
 * データの取得はここ（Server Component）で行い、画面コンポーネントへは
 * 出来上がった値だけを渡す。STEP 6 以降は `getDashboardCards()` の中身を
 * 実装するだけで、この画面の作りは変えずに実データを表示できる。
 */
export default async function DashboardPage() {
  const user = await requireUser();

  const cards = await getDashboardCards();
  const summary = summarizeDashboard(cards);

  // profiles は STEP 2 のトリガーで自動作成される。アプリ側からは INSERT せず、
  // 行が無い場合だけ画面で気付けるようにしている（RLS により自分の行のみ参照）。
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <Dashboard
      user={user}
      cards={summary.cards}
      total={summary.total}
      byPaymentDate={summary.byPaymentDate}
      lastUpdatedAt={summary.lastUpdatedAt}
      profileMissing={!profile}
    />
  );
}
