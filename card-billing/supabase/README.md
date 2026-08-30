# Supabase

`migrations/` に SQL マイグレーション、`tests/` に RLS・セキュリティの検証スクリプトを置いています。

## マイグレーション一覧

| ファイル | 内容 |
| --- | --- |
| `20260830120000_init_helpers.sql` | `private` スキーマ、`set_updated_at()` トリガー関数 |
| `20260830120100_profiles.sql` | `profiles`、新規ユーザー時の自動作成トリガー、RLS |
| `20260830120200_cards.sql` | `cards`、制約・インデックス・RLS |
| `20260830120300_billing_records.sql` | `billing_records`、重複防止の一意制約・RLS |
| `20260830120400_connections.sql` | `connections`（状態）、`private.oauth_credentials`（暗号化トークン）、サーバー専用 RPC |
| `20260830120500_fetch_logs.sql` | `fetch_logs`、RLS |

すべて SQL として再現可能です。Supabase Dashboard 上での手作業を前提とした構成は含めていません。

## 適用方法

### Supabase CLI（推奨）

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

### Dashboard から適用する場合

SQL Editor で `migrations/` のファイルを **ファイル名の昇順どおりに** 実行してください。

## Dashboard で手動設定が必要なもの

マイグレーションでは設定できない項目です。**STEP 3 以降に必要になります**が、
DB 構造の再現には不要です。

| 設定箇所 | 内容 | 必要になる STEP |
| --- | --- | --- |
| Authentication → Providers → Google | Google OAuth を有効化し、クライアント ID / シークレットを登録 | STEP 3 |
| Authentication → URL Configuration | Site URL とリダイレクト URL にアプリの URL を登録 | STEP 3 |
| Project Settings → API | `anon` キー / `service_role` キーを取得し `.env.local` に設定 | STEP 3 |

> **API に公開するスキーマ（Exposed schemas）は `public` のままにしてください。**
> `private` を追加すると、OAuth トークンのテーブルがブラウザから到達可能になり、
> 本設計のいちばん重要な防御が無効になります。

## テーブル構成

| テーブル | 役割 | クライアント権限 |
| --- | --- | --- |
| `public.profiles` | `auth.users` と 1:1 のユーザー情報 | SELECT / UPDATE（本人のみ） |
| `public.cards` | 登録カード | SELECT / INSERT / UPDATE / DELETE（本人のみ） |
| `public.billing_records` | 請求情報 | SELECT のみ（本人のみ） |
| `public.connections` | 連携の**状態のみ** | SELECT のみ（本人のみ） |
| `public.fetch_logs` | 取得処理の実行履歴 | SELECT のみ（本人のみ） |
| `private.oauth_credentials` | 暗号化済み OAuth トークン | **なし**（API から到達不可） |

保存しないもの: **カード番号の全桁 / セキュリティコード(CVV) / カード会社のログインパスワード**。
カード番号は下 4 桁 (`cards.last_four`) のみ保存できます。

## 検証の実行

ローカルの PostgreSQL 15 以上に対して、マイグレーションを適用したうえで
RLS とセキュリティ要件を検証します。

```bash
# PostgreSQL を起動しておく
./supabase/tests/run.sh
```

`tests/00_local_bootstrap.sql` は Supabase のロール（`anon` / `authenticated` /
`service_role`）と `auth` スキーマの最小構成をローカルに再現するためのものです。
**Supabase 本体には適用しないでください**（`migrations/` には含めていません）。

## 型の再生成

`src/types/database.ts` はこのスキーマと 1 対 1 で対応しています。
マイグレーションを変更したら、次のいずれかで型を更新してください。

```bash
# Supabase CLI から自動生成する場合
npx supabase gen types typescript --project-id <project-ref> --schema public \
  > src/types/database.ts

# ローカルの検証用 DB から生成する場合
npx supabase gen types typescript --db-url \
  postgresql://postgres@localhost:5432/card_billing_test --schema public \
  > src/types/database.ts
```

> 生成後は `private` スキーマが含まれていないことを確認してください（`--schema public` のみ指定）。
