# カード請求まとめ

複数のクレジットカードの **次回請求金額・支払日・合計** を 1 画面でまとめて確認するための Web アプリです。
カード会社のアプリを 1 つずつ開かなくても、数秒で「次回いくら引き落とされるか」が分かることだけに特化しています。

> このディレクトリは、同リポジトリ内の経費管理アプリ（リポジトリ直下の静的 PWA）とは
> **独立した別アプリ** です。既存アプリのファイルには手を加えていません。

## 技術構成

| 領域 | 使用技術 |
| --- | --- |
| フレームワーク | Next.js 16 (App Router) / React 19 |
| 言語 | TypeScript |
| スタイル | Tailwind CSS v4 |
| 認証 | Supabase Auth (Google OAuth) |
| データベース | Supabase (PostgreSQL + Row Level Security) |
| データ取得 | カード会社の公式 API / Gmail API |
| ホスティング想定 | Vercel |

## ディレクトリ構成

```
card-billing/
├── src/
│   ├── app/                  App Router
│   │   ├── layout.tsx        共通レイアウト・PWA メタ情報
│   │   ├── manifest.ts       PWA マニフェスト
│   │   ├── (auth)/login/     ログイン画面（公開）
│   │   ├── (app)/            ログイン必須エリア
│   │   └── auth/callback/    Google 認証のコールバック
│   ├── components/
│   │   ├── ui/               画面共通の部品
│   │   ├── auth/             ログイン・ログアウトのフォーム
│   │   ├── setup/            環境変数の設定案内
│   │   ├── dashboard/        ダッシュボード用   (STEP 4)
│   │   └── cards/            カード登録用       (STEP 5)
│   ├── proxy.ts              セッション更新と保護ページの前さばき
│   ├── lib/
│   │   ├── auth/             ログイン・ログアウト・遷移先の検証
│   │   ├── supabase/         Supabase クライアント (client / server / admin / proxy)
│   │   ├── env.ts            環境変数の読み取り
│   │   ├── format.ts         金額・日付の表示フォーマット
│   │   ├── logger.ts         機密情報をマスクするログ出力
│   │   ├── crypto.ts         OAuth トークンの暗号化・復号 (AES-256-GCM)
│   ├── providers/            カード会社ごとの取得処理（詳細は providers/README.md）
│   ├── services/             取得のオーケストレーション (STEP 10)
│   └── types/
│       ├── billing.ts        共通データ形式
│       └── database.ts       DB スキーマに対応する型
├── supabase/
│   ├── migrations/           DB マイグレーション
│   └── tests/                RLS・セキュリティ検証（詳細は supabase/README.md）
└── public/                   PWA アイコン
```

## セットアップ

```bash
cd card-billing
npm install
cp .env.local.example .env.local   # 値を入力する
npm run dev
```

http://localhost:3000 を開くと、環境変数の設定状況を確認できる画面が表示されます。

### 環境変数

`.env.local.example` を参照してください。`NEXT_PUBLIC_` が付いた値だけがブラウザに露出します。
サービスロールキー・OAuth クライアントシークレット・暗号鍵には**絶対に `NEXT_PUBLIC_` を付けないでください**。

## 認証（Google ログイン）

Supabase Auth の Google プロバイダでログインします。**この設定を済ませるまでログインできません。**
手順は下記のとおりで、Google 側 → Supabase 側 → アプリ側の順に行います。

### 1. Supabase 側でコールバック URL を確認する

1. Supabase ダッシュボード → **Authentication → Providers → Google** を開く
2. **Callback URL (for OAuth)** に表示されている URL をコピーする
   （`https://<プロジェクトID>.supabase.co/auth/v1/callback` の形式です）

この URL は次の手順で Google 側に登録します。**推測せず、必ず画面に表示された値をコピーしてください。**

### 2. Google Cloud Console で OAuth クライアントを作る

1. [Google Cloud Console](https://console.cloud.google.com/) にログインし、プロジェクトを作成（または選択）
2. **APIとサービス → OAuth 同意画面**
   - User Type は「外部」
   - アプリ名・ユーザーサポートメール・デベロッパーの連絡先を入力
   - スコープは追加不要（`openid` / `email` / `profile` は既定で含まれます）
   - **Gmail や Drive のスコープは追加しないでください**（Gmail 連携は STEP 7 で別途行います）
   - テストユーザーに自分の Google アカウントを追加
3. **APIとサービス → 認証情報 → 認証情報を作成 → OAuth クライアント ID**
   - アプリケーションの種類: **ウェブ アプリケーション**
   - **承認済みの JavaScript 生成元**: `http://localhost:3000`
   - **承認済みのリダイレクト URI**: 手順 1 でコピーした Supabase の Callback URL
     （アプリ自身の `/auth/callback` ではありません）
4. 作成後に表示される **クライアント ID** と **クライアント シークレット** をコピー

> Gmail API の有効化は不要です。STEP 3 では Gmail を一切使いません。

### 3. Supabase 側に登録する

1. **Authentication → Providers → Google** を開く
2. Google を有効化し、手順 2 の **Client ID** と **Client Secret** を貼り付けて保存
3. **Authentication → URL Configuration** を開く
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs** に `http://localhost:3000/auth/callback` を追加

> 本番公開時は、Vercel の URL を Google の「承認済みの JavaScript 生成元」と
> Supabase の Site URL / Redirect URLs に**追加**してください（ローカルの分は残して構いません）。

### 4. アプリ側の環境変数

`.env.local` に Supabase の URL と anon キーを設定します（`.env.local.example` 参照）。
**Google のクライアント ID / シークレットをアプリ側に設定する必要はありません。**

### 認証の仕組み

| 項目 | 内容 |
| --- | --- |
| 要求スコープ | `openid email profile` のみ（Gmail・Drive・Calendar は要求しない） |
| フロー | Supabase Auth の PKCE フロー。独自の OAuth 処理は書いていない |
| セッション | Cookie に保存。`src/proxy.ts` が毎リクエストで更新する |
| 認可の判定 | `src/app/(app)/layout.tsx` の `requireUser()` が Auth サーバーで検証（proxy の判定は前さばき） |
| 遷移先の検証 | `?next=` は同一サイト内の相対パスのみ許可（オープンリダイレクト対策） |

## データベース

マイグレーションは `supabase/migrations/` にあります。適用方法・テーブル構成・
型の再生成手順は [supabase/README.md](supabase/README.md) を参照してください。

RLS とセキュリティ要件はローカルの PostgreSQL 15 以上に対して検証できます。

```bash
npm run db:test
```

### 開発用のテストデータ

表示や集計を確認するための**架空の**カードと請求情報を投入できます。
カード番号の下 4 桁・金額・支払日はすべて作り値で、実在の値ではありません。

```bash
# 投入（テスト用カード 11 枚と請求情報）
ALLOW_BILLING_SEED=1 npm run billing:seed       -- --email あなたのメールアドレス

# 削除（投入したものだけを消します）
ALLOW_BILLING_SEED=1 npm run billing:seed:clean -- --email あなたのメールアドレス
```

> **本番のデータベースに対しては実行しないでください。**
> このスクリプトはアプリ（`src/` 配下）からは読み込まれず、本番ビルドにも含まれません。
> `ALLOW_BILLING_SEED=1` を明示的に付けたときだけ動き、`NODE_ENV=production` では
> 実行できないようにしてあります。実行前に対象のデータベース URL が表示されるので、
> 必ず確認してください。
>
> 動作確認が終わったら `billing:seed:clean` で削除してください。
> 投入したカードは決まった ID で作られるため、ご自身で登録したカードは消えません。

## セキュリティ方針

- カード番号の全桁・セキュリティコード(CVV)・カード会社のログインパスワードは保存しない（下 4 桁のみ任意で保存）
- カード会社へのアクセスは OAuth を優先し、ID/パスワードをアプリ内に保持しない
- API キー・シークレットはサーバー側のみで扱い、フロントエンドへ露出させない
- Supabase の Row Level Security により、他ユーザーのデータは参照できない
- ログインで要求する Google のスコープは `openid email profile` のみ（Gmail の権限は要求しない）
- ログイン後の遷移先は同一サイト内の相対パスのみ許可する（オープンリダイレクト対策）
- Gmail は必要最小限のスコープのみを使い、メール本文は保存せず抽出した項目だけを保存する
- ログにはトークン・メールアドレス・カード番号らしき数字列を出力しない（`lib/logger.ts` でマスク）
- OAuth トークンは AES-256-GCM で暗号化して保存し、暗号鍵は環境変数のみで管理する（DB にも Git にも置かない）
- OAuth トークンは非公開スキーマ (`private`) に置き、ブラウザ用クライアントからは本人であっても取得できない

## 実装ステップ

- [x] STEP 1 プロジェクト基盤
- [x] STEP 2 データベース設計・RLS
- [x] STEP 3 Google ログイン
- [ ] STEP 4 ダッシュボード UI
- [ ] STEP 5 カード登録機能
- [ ] STEP 6 ダミーデータによる請求表示
- [ ] STEP 7 Gmail 連携
- [ ] STEP 8 メール解析 Provider
- [ ] STEP 9 API Provider
- [ ] STEP 10 自動更新・手動更新
