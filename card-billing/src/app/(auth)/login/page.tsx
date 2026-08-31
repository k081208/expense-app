import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { Alert } from "@/components/ui/alert";
import { GoogleSignInForm } from "@/components/auth/google-sign-in-form";
import { SetupRequired } from "@/components/setup/setup-required";
import { authErrorMessage } from "@/lib/auth/errors";
import { safeNextPath, DEFAULT_REDIRECT } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPublicSupabaseEnv } from "@/lib/env";

export const metadata: Metadata = { title: "ログイン" };

/** セッションの状態で表示が変わるため、ビルド時に固定しない。 */
export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/login">) {
  // Supabase の接続情報が無い場合は、ログインを試みる前に設定手順を出す
  if (!hasPublicSupabaseEnv()) {
    return (
      <AppShell title="カード請求まとめ" subtitle="セットアップが必要です">
        <SetupRequired />
      </AppShell>
    );
  }

  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next);
  const errorParam = searchParams.error;

  // ログイン済みならログイン画面を見せない（二重ログインを求めない）
  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <AppShell title="カード請求まとめ">
      <div className="space-y-5">
        <SectionCard>
          <h2 className="text-xl font-bold tracking-tight">
            次回の支払いを、ひと目で。
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            複数のクレジットカードの次回請求金額と支払日を、1 画面でまとめて確認
            できます。カード会社のアプリを 1 つずつ開く必要はありません。
          </p>
        </SectionCard>

        {errorParam ? <Alert>{authErrorMessage(errorParam)}</Alert> : null}

        <div className="space-y-3">
          <GoogleSignInForm next={next === DEFAULT_REDIRECT ? undefined : next} />
          <p className="px-1 text-center text-xs leading-relaxed text-muted">
            ログインには Google アカウントの表示名とメールアドレスのみを使用します。
            <br />
            Gmail の読み取り権限は、この時点では要求しません。
          </p>
        </div>
      </div>
    </AppShell>
  );
}
