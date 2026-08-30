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
├── email/        Gmail のメール解析 (STEP 8)
│                 例: rakuten.ts / smbc.ts / paypay.ts / amex.ts
└── mock/         ダミーデータ  (STEP 6)
```

## 新しいカード会社を追加する手順

1. `api/<name>.ts` もしくは `email/<name>.ts` を作り、`BillingProvider` を実装する
2. `registry.ts` の `PROVIDERS` 配列に 1 行追加する

既存コードの変更は不要です。

## 守ること

- **例外を外に投げない**。`refresh()` は失敗しても `{ ok: false, code }` を返す。
  1 枚のカードの失敗で他のカードやアプリ全体が止まらないようにするため。
- **DB へ直接アクセスしない**。必要な値は `ProviderContext` で受け取る。
- **ログに機密情報を出さない**。出力は必ず `src/lib/logger.ts` を通す。
- **取得元による優先順位はここでは扱わない**。`api > gmail` の判定は
  `services/refresh.ts` が `SOURCE_PRIORITY` を使って一括で行う。
