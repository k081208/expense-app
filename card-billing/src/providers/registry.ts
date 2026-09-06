import type { BillingSource } from "@/types/billing";
import type { BillingProvider } from "./types";

/**
 * Provider の登録簿。
 *
 * 新しいカード会社に対応するときは
 *   1. `providers/api/<name>.ts` を追加し（Gmail の Parser は `providers/gmail/registry.ts` に登録する）
 *   2. ここの `PROVIDERS` に 1 行追加する
 * だけでよい。既存コードの変更は不要。
 *
 * STEP 1 時点では実装が 1 つも無いため空。
 * ダミー Provider は STEP 6、メール解析は STEP 8、公式 API は STEP 9 で追加する。
 */
const PROVIDERS: BillingProvider[] = [];

/** provider キー + 取得元 で一意に Provider を引く。 */
export function getProvider(
  key: string,
  source: BillingSource,
): BillingProvider | undefined {
  return PROVIDERS.find((p) => p.key === key && p.source === source);
}

/** 指定した provider キーで利用できる取得元の一覧（優先度の解決に使う）。 */
export function getProvidersForKey(key: string): BillingProvider[] {
  return PROVIDERS.filter((p) => p.key === key);
}

/** カード登録画面のカード会社リスト用。 */
export function listProviderChoices(): Array<{
  key: string;
  displayName: string;
  sources: BillingSource[];
}> {
  const byKey = new Map<string, { key: string; displayName: string; sources: BillingSource[] }>();
  for (const p of PROVIDERS) {
    const entry = byKey.get(p.key);
    if (entry) {
      entry.sources.push(p.source);
    } else {
      byKey.set(p.key, { key: p.key, displayName: p.displayName, sources: [p.source] });
    }
  }
  return [...byKey.values()];
}
