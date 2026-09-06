import { amexGmailParser } from "./parsers/amex";
import { aeonGmailParser, aupayGmailParser, edionGmailParser, saisonGmailParser } from "./parsers/candidates";
import { jaccsGmailParser } from "./parsers/jaccs";
import { jcbGmailParser } from "./parsers/jcb";
import { paypayGmailParser } from "./parsers/paypay";
import { rakutenGmailParser } from "./parsers/rakuten";
import type { GmailBillingParser, GmailParserSupport } from "./types";

/**
 * Gmail 請求メール Parser の登録簿。
 *
 * STEP 9 の公式 API Provider（`src/providers/registry.ts` の BillingProvider）とは
 * 責務が違うため、登録簿も分けている:
 *   - ここ: メール 1 通 → 請求情報 1 件 の変換規則（IO を持たない）
 *   - BillingProvider: カード 1 枚の請求を取得する処理（トークン・タイムアウトを扱う）
 * STEP 10 のパイプラインが、この登録簿の Parser を使って Gmail 取得元の
 * BillingProvider を組み立てる想定。
 */
const PARSERS: readonly GmailBillingParser[] = [
  rakutenGmailParser,
  jaccsGmailParser,
  paypayGmailParser,
  amexGmailParser,
  jcbGmailParser,
  edionGmailParser,
  aeonGmailParser,
  saisonGmailParser,
  aupayGmailParser,
];

export const gmailParserRegistry = {
  /** provider_key で Parser を引く。未登録なら undefined */
  get(providerKey: string): GmailBillingParser | undefined {
    return PARSERS.find((p) => p.providerKey === providerKey);
  },
  list(): readonly GmailBillingParser[] {
    return PARSERS;
  },
  /** 正式対応している Parser だけ */
  official(): readonly GmailBillingParser[] {
    return PARSERS.filter((p) => p.support.level === "official");
  },
  /** 対応状況。未登録の会社は not_implemented */
  supportOf(providerKey: string): GmailParserSupport {
    return (
      PARSERS.find((p) => p.providerKey === providerKey)?.support ?? {
        level: "unsupported",
        reason: "not_implemented",
      }
    );
  },
};
