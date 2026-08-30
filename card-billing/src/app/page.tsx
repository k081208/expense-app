import { AppShell } from "@/components/ui/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { StatusRow } from "@/components/ui/status-row";
import { hasPublicSupabaseEnv, missingServerEnv, publicEnv } from "@/lib/env";

/** 環境変数は実行時に読むため、ビルド時に固定しない。 */
export const dynamic = "force-dynamic";

/**
 * STEP 1 時点のトップ画面。
 * まだ認証もダッシュボードも無いため、環境設定が正しく済んでいるかを確認できる
 * セットアップ状況画面を表示する。STEP 4 でダッシュボードに置き換える。
 */
export default function Home() {
  const supabaseReady = hasPublicSupabaseEnv();
  const missing = missingServerEnv();
  const googleReady =
    !missing.includes("GOOGLE_CLIENT_ID") &&
    !missing.includes("GOOGLE_CLIENT_SECRET");
  const serviceRoleReady = !missing.includes("SUPABASE_SERVICE_ROLE_KEY");
  const secretsReady =
    !missing.includes("TOKEN_ENCRYPTION_KEY") && !missing.includes("CRON_SECRET");

  const allReady = supabaseReady && googleReady && serviceRoleReady && secretsReady;

  return (
    <AppShell
      title="カード請求まとめ"
      subtitle="STEP 1: プロジェクト基盤のセットアップ"
    >
      <div className="space-y-4">
        <SectionCard>
          <p className="text-xs font-semibold tracking-wide text-muted">
            現在の状態
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight">
            {allReady ? "セットアップ完了" : "環境変数の設定待ち"}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {allReady
              ? "STEP 2（データベース設計）へ進む準備ができています。"
              : ".env.local.example をコピーして .env.local を作成し、値を入力してください。"}
          </p>
        </SectionCard>

        <SectionCard title="環境変数">
          <StatusRow
            label="Supabase 接続"
            done={supabaseReady}
            hint="NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
          />
          <StatusRow
            label="Supabase サービスロール"
            done={serviceRoleReady}
            hint="SUPABASE_SERVICE_ROLE_KEY（自動更新バッチ用・サーバー専用）"
          />
          <StatusRow
            label="Google OAuth"
            done={googleReady}
            hint="GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
          />
          <StatusRow
            label="暗号鍵・バッチ用シークレット"
            done={secretsReady}
            hint="TOKEN_ENCRYPTION_KEY / CRON_SECRET"
          />
        </SectionCard>

        <SectionCard title="これから実装する内容">
          <ol className="space-y-2 text-sm text-muted">
            <li>STEP 2 データベース設計（テーブル + RLS）</li>
            <li>STEP 3 Google ログイン</li>
            <li>STEP 4 ダッシュボード UI</li>
            <li>STEP 5 カード登録機能</li>
            <li>STEP 6 ダミーデータによる請求表示</li>
            <li>STEP 7 Gmail 連携</li>
            <li>STEP 8 メール解析 Provider</li>
            <li>STEP 9 API Provider</li>
            <li>STEP 10 自動更新・手動更新</li>
          </ol>
        </SectionCard>

        <p className="px-1 text-xs text-muted">アプリ URL: {publicEnv.appUrl}</p>
      </div>
    </AppShell>
  );
}
