import Image from "next/image";
import { AppShell } from "@/components/ui/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { Alert } from "@/components/ui/alert";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** セッションの状態で表示が変わるため、ビルド時に固定しない。 */
export const dynamic = "force-dynamic";

/**
 * ログイン後の暫定画面（STEP 4 でダッシュボードに置き換える）。
 *
 * 認証が正しく動いていることを確認するための最小限の表示に留める。
 * あわせて、STEP 2 で作ったトリガーによって profiles 行が自動作成されたか
 * どうかも確認できるようにしている（アプリ側からは INSERT しない）。
 */
export default async function HomePage() {
  const user = await requireUser();

  // 自分の profiles 行を参照するだけ。RLS により他人の行は見えない。
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, created_at")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell title="カード請求まとめ" subtitle="ログインしました">
      <div className="space-y-4">
        <SectionCard>
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt=""
                width={56}
                height={56}
                unoptimized
                className="size-14 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand"
              >
                {user.displayName.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-bold tracking-tight">
                {user.displayName} さん
              </p>
              {user.email ? (
                <p className="truncate text-sm text-muted">{user.email}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted">
                Google アカウントでログイン中
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="プロフィール">
          {profile ? (
            <p className="text-sm leading-relaxed text-muted">
              初回ログイン時に profiles が自動作成されています。
              <br />
              表示名:{" "}
              <span className="font-medium text-foreground">
                {profile.display_name ?? "（未設定）"}
              </span>
            </p>
          ) : (
            <Alert tone="info">
              profiles がまだ作成されていません。データベースのマイグレーションが
              適用されているか確認してください。
            </Alert>
          )}
        </SectionCard>

        <SectionCard title="次に実装する内容">
          <p className="text-sm leading-relaxed text-muted">
            この画面は STEP 4 でダッシュボード（次回支払予定の合計・カード一覧・
            支払日別の集計）に置き換わります。
          </p>
        </SectionCard>

        <SignOutForm />
      </div>
    </AppShell>
  );
}
