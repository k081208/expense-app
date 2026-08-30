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
│   │   └── page.tsx          トップ画面（STEP 4 でダッシュボードに置き換え）
│   ├── components/
│   │   ├── ui/               画面共通の部品
│   │   ├── dashboard/        ダッシュボード用   (STEP 4)
│   │   └── cards/            カード登録用       (STEP 5)
│   ├── lib/
│   │   ├── supabase/         Supabase クライアント (client / server / admin)
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

## データベース

マイグレーションは `supabase/migrations/` にあります。適用方法・テーブル構成・
型の再生成手順は [supabase/README.md](supabase/README.md) を参照してください。

RLS とセキュリティ要件はローカルの PostgreSQL 15 以上に対して検証できます。

```bash
npm run db:test
```

## セキュリティ方針

- カード番号の全桁・セキュリティコード(CVV)・カード会社のログインパスワードは保存しない（下 4 桁のみ任意で保存）
- カード会社へのアクセスは OAuth を優先し、ID/パスワードをアプリ内に保持しない
- API キー・シークレットはサーバー側のみで扱い、フロントエンドへ露出させない
- Supabase の Row Level Security により、他ユーザーのデータは参照できない
- Gmail は必要最小限のスコープのみを使い、メール本文は保存せず抽出した項目だけを保存する
- ログにはトークン・メールアドレス・カード番号らしき数字列を出力しない（`lib/logger.ts` でマスク）
- OAuth トークンは AES-256-GCM で暗号化して保存し、暗号鍵は環境変数のみで管理する（DB にも Git にも置かない）
- OAuth トークンは非公開スキーマ (`private`) に置き、ブラウザ用クライアントからは本人であっても取得できない

## 実装ステップ

- [x] STEP 1 プロジェクト基盤
- [x] STEP 2 データベース設計・RLS
- [ ] STEP 3 Google ログイン
- [ ] STEP 4 ダッシュボード UI
- [ ] STEP 5 カード登録機能
- [ ] STEP 6 ダミーデータによる請求表示
- [ ] STEP 7 Gmail 連携
- [ ] STEP 8 メール解析 Provider
- [ ] STEP 9 API Provider
- [ ] STEP 10 自動更新・手動更新
