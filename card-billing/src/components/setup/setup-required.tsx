import { SectionCard } from "@/components/ui/section-card";
import { StatusRow } from "@/components/ui/status-row";
import { hasPublicSupabaseEnv, missingServerEnv } from "@/lib/env";

/**
 * Supabase の接続情報が未設定のときに出す案内。
 *
 * 環境変数が足りないだけでログイン画面が真っ白になると原因が分かりにくいため、
 * 何を設定すればよいかをその場で示す。
 * （STEP 1 のセットアップ画面をログイン画面から再利用できるようにしたもの）
 */
export function SetupRequired() {
  const missing = missingServerEnv();

  return (
    <div className="space-y-4">
      <SectionCard>
        <p className="text-xs font-semibold tracking-wide text-muted">
          現在の状態
        </p>
        <p className="mt-2 text-2xl font-bold tracking-tight">
          環境変数の設定待ち
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          <code className="rounded bg-surface-muted px-1 py-0.5">
            .env.local.example
          </code>{" "}
          をコピーして{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5">.env.local</code>{" "}
          を作成し、Supabase の接続情報を入力してから再読み込みしてください。
        </p>
      </SectionCard>

      <SectionCard title="環境変数">
        <StatusRow
          label="Supabase 接続（ログインに必要）"
          done={hasPublicSupabaseEnv()}
          hint="NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
        />
        <StatusRow
          label="Supabase サービスロール"
          done={!missing.includes("SUPABASE_SERVICE_ROLE_KEY")}
          hint="SUPABASE_SERVICE_ROLE_KEY（STEP 10 の自動更新で使用）"
        />
        <StatusRow
          label="暗号鍵・バッチ用シークレット"
          done={
            !missing.includes("TOKEN_ENCRYPTION_KEY") &&
            !missing.includes("CRON_SECRET")
          }
          hint="TOKEN_ENCRYPTION_KEY / CRON_SECRET（STEP 7 以降で使用）"
        />
      </SectionCard>

      <p className="px-1 text-xs leading-relaxed text-muted">
        Google のクライアント ID とシークレットは、このアプリではなく Supabase の
        ダッシュボード（Authentication → Providers → Google）に登録します。
        設定手順は README を参照してください。
      </p>
    </div>
  );
}
