# Provider 層

カード会社ごとの請求情報の取得処理を **1 社 1 ファイル** で分離して置く場所です。
呼び出し側（`src/services/refresh.ts`）はカード会社を一切意識せず、
`BillingProvider` インターフェースと共通データ形式 `NormalizedBilling` だけを扱います。

```
providers/
├── types.ts      共通インターフェース (fetchBillingAmount / fetchPaymentDate / refresh / healthCheck)
├── errors.ts     エラー分類と、ユーザー向け表示文言への変換
├── registry.ts   Provider の登録簿。新規追加はここに 1 行足すだけ
├── api/          公式 API 連携  (STEP 9)
├── gmail/        Gmail 請求メールの Parser (STEP 8B)
│   ├── types.ts        ParsedGmailBilling / GmailProviderRule など
│   ├── registry.ts     gmailParserRegistry.get(providerKey)
│   ├── parse.ts        規則 → Parser（送信元 → 件名 → 本文 → カード → 金額 → 支払日）
│   ├── mime.ts         MIME から本文テキスト（text/plain 優先、HTML は文字列処理でテキスト化）
│   ├── match-card.ts   本文の下 4 桁でカードを決める
│   ├── select.ts       同じカードの複数メールから「次回の請求」を選ぶ
│   ├── config/query.ts 正式な Gmail 検索条件（from: + subject: + newer_than:）
│   ├── extract/        金額・支払日・下 4 桁・送信元・件名の抽出（純粋関数）
│   └── parsers/        1 社 1 ファイル: rakuten / jaccs / paypay / amex / jcb、未対応は candidates
└── mock/         ダミーデータ  (STEP 6)
```

## Gmail Parser と BillingProvider の関係

`gmail/` の Parser は **メール 1 通 → 請求情報 1 件** の変換規則だけを持ち、Gmail API にも
DB にも触れません（取得は `src/lib/gmail/parser-run.ts`、保存は STEP 10）。
STEP 9 の公式 API Provider が実装する `BillingProvider` とは責務が違うため、
登録簿も `gmail/registry.ts`（`gmailParserRegistry`）と `registry.ts`（`PROVIDERS`）に分けています。
STEP 10 のパイプラインが、Parser を使って Gmail 取得元の `BillingProvider` を組み立てる想定です。

### Parser の規則で守ること

- 送信元は実メールで確認したアドレスの **完全一致** だけ（ドメインの部分一致は使わない）
- 件名は分類にだけ使う。件名だけで金額・支払日を決めない
- 金額はラベル（ご請求金額 など）の直後だけを見る。本文で最初に出てくる円は取らない
- カードの識別は本文の下 4 桁。`display_name` は使わない
- 実メールの本文を確認できていない会社は `support.level = "unsupported"` にして推測で書かない

## 新しいカード会社を追加する手順

1. 公式 API なら `api/<name>.ts` を作り `BillingProvider` を実装して `registry.ts` の `PROVIDERS` に 1 行追加する
2. Gmail のメール解析なら `gmail/parsers/<name>.ts` に規則（`GmailProviderRule`）を書き、
   `gmail/registry.ts` の `PARSERS` に 1 行追加する

既存コードの変更は不要です。

## 守ること

- **例外を外に投げない**。`refresh()` は失敗しても `{ ok: false, code }` を返す。
  1 枚のカードの失敗で他のカードやアプリ全体が止まらないようにするため。
- **DB へ直接アクセスしない**。必要な値は `ProviderContext` で受け取る。
- **ログに機密情報を出さない**。出力は必ず `src/lib/logger.ts` を通す。
- **取得元による優先順位はここでは扱わない**。`api > gmail` の判定は
  `services/refresh.ts` が `SOURCE_PRIORITY` を使って一括で行う。
