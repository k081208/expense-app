import { SectionCard } from "@/components/ui/section-card";
import { Alert } from "@/components/ui/alert";
import { SignOutForm } from "@/components/auth/sign-out-form";
import type { AppUser } from "@/lib/auth/session";

/**
 * アカウント表示とログアウト。
 *
 * ダッシュボードの主役は金額なので、Google のプロフィールは控えめに扱う。
 * ログアウトは STEP 3 の実装をそのまま使う。
 */
export function AccountCard({
  user,
  profileMissing = false,
}: {
  user: AppUser;
  /**
   * profiles 行が見つからない場合のみ true。
   * 通常は自動作成されるため、真になるのはマイグレーション未適用などの異常時だけ。
   */
  profileMissing?: boolean;
}) {
  return (
    <SectionCard title="アカウント">
      <p className="truncate text-sm font-medium">{user.displayName}</p>
      {user.email ? (
        <p className="truncate text-xs text-muted">{user.email}</p>
      ) : null}

      {profileMissing ? (
        <div className="mt-3">
          <Alert tone="info">
            プロフィールがまだ作成されていません。データベースのマイグレーションが
            適用されているか確認してください。
          </Alert>
        </div>
      ) : null}

      <div className="mt-4">
        <SignOutForm />
      </div>
    </SectionCard>
  );
}
