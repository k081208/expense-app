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
│   │   │   ├── settings/connections/  Gmail 連携の設定 (STEP 7)
│   │   │   └── dev/gmail-discovery/   請求メールの探索（開発専用・STEP 8A）
│   │   ├── auth/callback/    ログインのコールバック（STEP 3）
│   │   └── api/integrations/gmail/callback/
│   │                         Gmail 連携のコールバック（STEP 7・ログインとは別）
│   ├── components/
│   │   ├── ui/               画面共通の部品
│   │   ├── auth/             ログイン・ログアウトのフォーム
│   │   ├── setup/            環境変数の設定案内
│   │   ├── dashboard/        ダッシュボード用   (STEP 4)
│   │   ├── cards/            カード登録用       (STEP 5)
│   │   └── settings/         Gmail 連携の設定用 (STEP 7)
│   ├── proxy.ts              セッション更新と保護ページの前さばき
│   ├── lib/
│   │   ├── auth/             ログイン・ログアウト・遷移先の検証
│   │   ├── gmail/            Gmail 連携の OAuth・連携の保存・トークン更新 (STEP 7)
│   │   │                     Gmail API クライアント・請求メールの探索 (STEP 8A)
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

## Gmail 連携（複数アカウント対応）

カード会社から届く「請求確定のお知らせ」メールを読み取るために、Gmail への
読み取り権限をアプリへ渡します。**ログイン（STEP 3）とはまったく別の仕組みです。**

### ログインとの違い

| | ログイン（STEP 3） | Gmail 連携（STEP 7） |
| --- | --- | --- |
| 目的 | このアプリに入る | 請求メールを読む権限をもらう |
| 仕組み | Supabase Auth の Google プロバイダ | アプリ自身が行う Google の認可コードフロー |
| OAuth クライアント | Supabase に登録したもの | **別に作った Gmail 専用のもの** |
| コールバック | `/auth/callback` | `/api/integrations/gmail/callback` |
| スコープ | `openid email profile` | `openid email https://www.googleapis.com/auth/gmail.readonly` |
| 連携できる数 | ログインは 1 アカウント | Gmail は**何アカウントでも**追加できる |

ログイン用の Google アカウントと、メールを読む Google アカウントは別で構いません。
ログインに使っていないアカウントの Gmail も連携できます。

### 複数の Gmail を使い分ける

カードごとに「どの Gmail アカウントから請求メールを読むか」を選べます。
例えば、あるカードの明細は仕事用アドレスに、別のカードは個人用アドレスに届く、
といった使い分けができます。設定は **Gmail 連携** 画面（`/settings/connections`）の
「カードごとの取得元」から行い、**未設定**を選べば割り当てを外せます。

### Google Cloud Console の設定

ログイン用（STEP 3）とは**別の OAuth クライアント**を作ります。
ログイン用のクライアントに Gmail のスコープを足さないでください。

1. **APIとサービス → ライブラリ** で **Gmail API** を検索し、**有効にする**
2. **APIとサービス → OAuth 同意画面**
   - **データアクセス**（Data Access）で **スコープを追加** し、
     `https://www.googleapis.com/auth/gmail.readonly` を追加する
   - **対象**（Audience）の **テストユーザー** に、連携したい Google アカウントを
     **すべて**追加する（連携する Gmail アカウントの分だけ必要です）
3. **APIとサービス → 認証情報 → 認証情報を作成 → OAuth クライアント ID**
   - アプリケーションの種類: **ウェブ アプリケーション**
   - 名前は分かるように（例: `card-billing Gmail 連携`）
   - **承認済みのリダイレクト URI** に次を登録する

     ```
     http://localhost:3000/api/integrations/gmail/callback
     ```

     Supabase の Callback URL でも `/auth/callback` でもありません。
4. 表示された **クライアント ID / クライアント シークレット** を `.env.local` の
   `GOOGLE_GMAIL_CLIENT_ID` / `GOOGLE_GMAIL_CLIENT_SECRET` に設定する
5. `GOOGLE_GMAIL_REDIRECT_URI` に、手順 3 で登録した URI と**完全に同じ文字列**を設定する
6. `TOKEN_ENCRYPTION_KEY` を設定する（`openssl rand -base64 32`）

> 本番公開時は、本番 URL の `/api/integrations/gmail/callback` を Google の
> 承認済みリダイレクト URI に**追加**し、`GOOGLE_GMAIL_REDIRECT_URI` も切り替えてください。

### 要求するスコープ

| スコープ | 用途 |
| --- | --- |
| `openid` | 連携先アカウントを一意に識別する (`sub`) |
| `email` | どのアカウントを繋いだかを画面に表示する |
| `https://www.googleapis.com/auth/gmail.readonly` | 請求メールを読む（読み取り専用） |

`profile`・Drive・Calendar・送信権限は要求しません。書き込み・削除もできません。

### トークンの保存方式

| 項目 | 内容 |
| --- | --- |
| フロー | 認可コードフロー + PKCE (S256)。`state` と `code_verifier` は HttpOnly Cookie に短時間だけ置く。`include_granted_scopes` は付けない（要求した 3 つのスコープだけを受け取る） |
| ID トークン | 署名・`iss`・`aud`・`exp` を Google の公開鍵で検証する（Base64 を解いて信用することはしない） |
| 保存場所 | 非公開スキーマ `private.oauth_credentials`（PostgREST に公開していない） |
| 暗号化 | AES-256-GCM。鍵は `TOKEN_ENCRYPTION_KEY` のみ。DB にも Git にも鍵は置かない |
| 読み書き | `service_role` だけが実行できる関数経由。ブラウザからは本人でも取得できない |
| アカウントの識別 | Google の `sub`（メールアドレスは識別に使わない。変更されうるため） |

### 再接続と解除

- **再接続**: 同じ Google アカウントをもう一度連携すると、既存の連携を
  **同じ ID のまま**更新します。カードごとの取得元の設定はやり直す必要がありません。
- **解除**: Google 側でトークンを取り消し、保存しているトークンを削除して、
  状態を「解除済み」にします。**カードごとの割り当ては残します**ので、
  同じアカウントを繋ぎ直せばそのまま使えます。
- 完全にやめる場合は、Google アカウントの
  [サードパーティ アプリとの連携](https://myaccount.google.com/connections) からも
  アクセス権を削除してください。

### 開発中の注意

- **テストモードの OAuth 同意画面では、リフレッシュトークンの有効期限が 7 日間です。**
  1 週間ほど放置すると連携が切れて「再連携が必要」と表示されます。
  そのときは「Gmail アカウントを追加」から同じアカウントを選び直してください。
  （公開ステータスを「本番環境」にすると、この 7 日間の制限はなくなります）
- テストユーザーに登録していない Google アカウントでは連携できません。
- 連携できる数の上限はアプリ側では設けていませんが、テストモードでは
  テストユーザーが 100 名までという Google 側の制限があります。

### 本番公開前の注意

`gmail.readonly` は Google の **制限付きスコープ（Restricted Scope）** です。
自分とテストユーザーだけで使う分には申請は不要ですが、
**一般公開する場合は Google の OAuth 認証（verification）とセキュリティ評価が必要**で、
数週間から数か月かかることがあります。個人利用の範囲であれば、
公開ステータスを「テスト」のままにして、テストユーザーに自分のアカウントを
登録して使うのが簡単です。

### 請求メールの探索（開発専用・STEP 8A）

各カード会社から**実際に届いているメール**の送信元と件名の形を調べるための開発機能です。
STEP 8B でメール解析の正式な条件（送信元・件名）を決めるための材料にします。
一般の利用者向けの画面ではありません。

```
ENABLE_GMAIL_DISCOVERY=1   # .env.local に追加してから npm run dev
```

http://localhost:3000/dev/gmail-discovery を開き「探索を実行」を押します。

| 項目 | 内容 |
| --- | --- |
| 有効になる条件 | 開発モード（`NODE_ENV` が production でない）**かつ** `ENABLE_GMAIL_DISCOVERY=1`。本番では 404。Server Action 側にも同じ判定がある |
| 探索の単位 | カード会社 × Gmail アカウント。どの Gmail で探すかは「カードごとの取得元」の割り当てから決める（コードに書かない）。楽天 2 枚・JCB 2 枚でも検索は 1 回 |
| 検索 | Gmail API の `q` で絞る（会社名などの広い探索語 ＋ `newer_than:365d` ＋ `-from:me`）。既定は過去 365 日・上限 50 件・迷惑メールとゴミ箱は除外。いずれも画面で変更できる。1 社だけを対象にし、探索結果で見つかった送信元（`from:…`）などの条件を追加して絞り込むこともできる |
| 取得するもの | 各メールの From / Subject / Date / Message-ID だけ（`messages.get` の `format=metadata`）。本文・snippet・添付・To/Cc は取得しない |
| 表示 | 送信元アドレス別の件数、件名は数字・金額・日付を `[NUMBER]` `[AMOUNT]` `[DATE]` に置き換えたテンプレート別の件数、最新／最古の日時。Gmail アカウントはマスク表示 |
| 保存 | 結果はどこにも保存しない（DB テーブルも作らない） |
| トークン | `getValidGoogleAccessToken()` を通す。期限切れなら自動更新され、更新が起きたことが画面に表示される |

> ここで使う探索語は「候補を見つける」ためのものです。送信元アドレスや件名を推測して
> 決め打ちしたものではなく、正式な取得条件としてそのまま採用することもしません。

## データベース

マイグレーションは `supabase/migrations/` にあります。適用方法・テーブル構成・
型の再生成手順は [supabase/README.md](supabase/README.md) を参照してください。

RLS とセキュリティ要件はローカルの PostgreSQL 15 以上に対して検証できます。

```bash
npm run db:test
```

Gmail API クライアントと請求メールの探索の単体テスト（Google にも Supabase にも接続しません）:

```bash
npm test
```

### 開発用のテストデータ

表示や集計を確認するための**架空の**カードと請求情報を投入できます。
カード番号の下 4 桁・金額・支払日はすべて作り値で、実在の値ではありません。

```bash
# 投入（テスト用カード 11 枚と請求情報）
ALLOW_BILLING_SEED=1 npm run billing:seed       -- --email あなたのメールアドレス

# 請求情報だけを削除（カード・Gmail 連携・カードごとの割り当ては残す）
ALLOW_BILLING_SEED=1 npm run billing:seed:clean-records -- --email あなたのメールアドレス

# カードごと削除（投入したものだけを消します）
ALLOW_BILLING_SEED=1 npm run billing:seed:clean -- --email あなたのメールアドレス
```

`clean-records` は、このスクリプトが投入した請求情報を「カード ID × 取得元 × 支払日 × 金額 × 状態」
まで一致するものに限って削除します。実際の請求情報が偶然一致することは事実上ありません。
支払日は投入日から計算されるため、投入日と違う日に削除する場合は `--as-of YYYY-MM-DD`（投入日）を
付けてください。`--dry-run` を付けると、削除せずに対象だけを表示します。

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
- Gmail 連携はログインと別の OAuth クライアントを使い、ログイン側のスコープには Gmail を追加しない
- Gmail 連携の `state` と PKCE の `code_verifier` は HttpOnly Cookie に短時間だけ置き、照合後に削除する
- Google の ID トークンは署名・`iss`・`aud`・`exp` を検証したうえでのみ信用する
- 連携先アカウントの識別には Google の `sub` を使い、メールアドレスは表示用にとどめる
- サービスロールで行う操作は、必ず認証済みユーザーの `user_id` を条件に含めて他人の行に触れないようにする
- 画面・URL・ログには認可コード / アクセストークン / リフレッシュトークン / ID トークンを一切出さない

## 実装ステップ

- [x] STEP 1 プロジェクト基盤
- [x] STEP 2 データベース設計・RLS
- [x] STEP 3 Google ログイン
- [x] STEP 4 ダッシュボード UI
- [x] STEP 5 カード登録機能
- [x] STEP 6 ダミーデータによる請求表示
- [x] STEP 7 Gmail 連携（複数アカウント対応）
- [x] STEP 8A 請求メールの探索（送信元・件名パターンの特定）
- [ ] STEP 8B メール解析 Provider
- [ ] STEP 9 API Provider
- [ ] STEP 10 自動更新・手動更新
