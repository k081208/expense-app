import type { NormalizedBilling } from "@/types/billing";

/**
 * Gmail 請求メール Parser（STEP 8B）の共通型。
 *
 * ここにある型は「メール 1 通 → 正規化済みの請求情報 1 件」の変換にだけ使う。
 * Gmail API にも DB にも触れない。実行（取得・画面）は `src/lib/gmail/parser-run.ts` 側。
 */

/** 件名から決まるメールの種類。 */
export type GmailMailClass =
  /** 請求金額が確定した案内 */
  | "confirmed"
  /** 確定前の予定金額の案内 */
  | "provisional"
  /** 引き落とし日の案内（金額が無いこともある） */
  | "payment_notice"
  /** 確定後に内容が変更された案内（JCB など） */
  | "changed"
  /** 対象外（利用速報・キャンペーンなど） */
  | "irrelevant";

/** Parser が返す失敗の分類。画面にはこの分類だけを出し、本文は出さない。 */
export type GmailParseErrorCode =
  /** 送信元が正式な送信元と完全一致しなかった */
  | "sender_mismatch"
  /** 件名がどの種類にも当てはまらなかった */
  | "subject_mismatch"
  /** 本文（text/plain も text/html も）が無い */
  | "body_missing"
  /** 本文を文字として復号できなかった（文字化け） */
  | "body_decode_failed"
  /** 金額のラベルが見つからない・金額が続いていない */
  | "amount_parse_failed"
  /** 同じラベルに異なる金額が複数あり、どれか決められない */
  | "amount_ambiguous"
  /** 支払日が見つからない・日付として不正 */
  | "payment_date_parse_failed"
  /** 同じ会社のカードが複数あり、本文の下 4 桁で 1 枚に絞れない */
  | "card_match_ambiguous"
  /** 下 4 桁が未登録、または登録値が本文と一致しない（設定の見直しが必要） */
  | "card_configuration_required"
  /** この会社の Parser は正式対応していない */
  | "provider_unsupported";

export type GmailUnsupportedReason =
  /** 実メールの本文を確認できた件数が足りない */
  | "insufficient_real_samples"
  /** 実メールが 1 通程度しか無く、形が安定しているか判断できない */
  | "limited_sample"
  /** 実メールがまだ 1 通も届いていない */
  | "waiting_for_real_sample"
  /** 未着手 */
  | "not_implemented";

export type GmailParserSupport =
  | { level: "official" }
  | { level: "unsupported"; reason: GmailUnsupportedReason; note?: string };

/** 件名の分類規則。上から順に評価する（changed → confirmed → provisional → paymentNotice）。 */
export type GmailSubjectRules = {
  changed?: readonly RegExp[];
  confirmed: readonly RegExp[];
  provisional?: readonly RegExp[];
  paymentNotice?: readonly RegExp[];
};

/**
 * カード会社 1 社ぶんの解析規則。
 * 探索（Discovery）の広い語とは別物で、実メールで確認できた送信元・件名だけを書く。
 */
export type GmailProviderRule = {
  providerKey: string;
  support: GmailParserSupport;
  /** 正式な送信元アドレス（小文字）。完全一致のみ。ドメインの部分一致は使わない */
  senderAllowlist: readonly string[];
  subject: GmailSubjectRules;
  /** Gmail 検索の `subject:` に使う語（正式条件）。 */
  searchSubjects: readonly string[];
  /** 金額のラベル。優先順。 */
  amountLabels: readonly RegExp[];
  /** この語を含む行は金額の候補にしない（ポイント・利用可能額など）。 */
  amountExclude: readonly RegExp[];
  /** 支払日のラベル。優先順。 */
  dateLabels: readonly RegExp[];
  dateExclude?: readonly RegExp[];
  /** 本文で支払日が見つからないとき、件名の日付も使う（引き落とし日の案内など）。 */
  dateFromSubject?: boolean;
  /** 既定の検索期間（日）。 */
  lookbackDays?: number;
  /**
   * 未対応（support.level = "unsupported"）のまま、開発画面の「未対応の会社も試す」で
   * 実メール本文の形を確認するための観測済み条件を持つことを示す。
   * 送信元・件名は探索で観測したものだけ。結果は採用されず、正式対応の根拠にもしない。
   */
  trial?: boolean;
};

/** IO 層が組み立てて Parser に渡す 1 通ぶんの入力。message ID は渡さない。 */
export type GmailParseInput = {
  from: string | null;
  subject: string | null;
  /** 受信日時（ISO 8601）。年の補完と新旧判定に使う */
  receivedAt: string;
  /** MIME から取り出した本文テキスト。取り出せなければ null */
  bodyText: string | null;
  bodyStatus: "ok" | "missing" | "decode_failed";
};

/** カード特定に必要な最小限の情報。 */
export type GmailCardCandidate = {
  id: string;
  displayName: string;
  lastFour: string | null;
};

export type GmailCardMatch =
  | { status: "matched"; card: GmailCardCandidate; matchedBy: "last_four" | "single_card" }
  | {
      status: "error";
      code: "card_match_ambiguous" | "card_configuration_required";
      /** 画面向けの短い説明（下 4 桁の全桁は含めない） */
      detail: string;
    };

/**
 * メール 1 通の解析結果。`NormalizedBilling` に `sourceReceivedAt` などを足したもの。
 * 本文・件名の生文字列・message ID は含めない。
 */
export type ParsedGmailBilling = {
  providerKey: string;
  mailClass: GmailMailClass;
  cardId: string | null;
  cardDisplayName: string | null;
  /** 一致したカードの登録済み下 4 桁（表示は必ず伏字関数を通す） */
  cardLastFour: string | null;
  matchedBy: "last_four" | "single_card" | null;
  amount: number | null;
  /** "YYYY-MM-DD" */
  paymentDate: string | null;
  isProvisional: boolean;
  status: "success" | "error";
  errorCode: GmailParseErrorCode | null;
  /** メールの受信日時（ISO 8601）。Gmail の internalDate を優先し、無ければ Date ヘッダー */
  sourceReceivedAt: string;
  /** 未対応の会社を試行モードで解析した結果（採用しない） */
  trial: boolean;
  /** マスク済みの抽出過程（開発画面での調整用）。本文そのものは含めない */
  debug: string[];
};

/** 1 社ぶんの Parser。規則から `createGmailParser()` で作る。 */
export type GmailBillingParser = {
  readonly providerKey: string;
  readonly support: GmailParserSupport;
  readonly rule: GmailProviderRule;
  /** 正式な Gmail 検索条件を組み立てる */
  buildQuery(days: number): string;
  classifySubject(subject: string | null | undefined): GmailMailClass;
  /** 未対応でも試行モードで解析できるか（観測済みの送信元・件名を持つ） */
  readonly canTrial: boolean;
  /** 1 通を解析する。例外は投げない。trial は未対応の会社を開発画面で試すときだけ true */
  parse(
    input: GmailParseInput,
    cards: readonly GmailCardCandidate[],
    options?: { trial?: boolean },
  ): ParsedGmailBilling;
};

/**
 * 解析結果を共通データ形式へ変換する。カードが特定できていなければ null。
 * STEP 8B ではこの値を DB に保存しない（保存は STEP 10）。
 */
export function toNormalizedBilling(
  parsed: ParsedGmailBilling,
  fetchedAt: string,
): NormalizedBilling | null {
  if (!parsed.cardId) return null;
  return {
    cardId: parsed.cardId,
    provider: parsed.providerKey,
    amount: parsed.amount,
    paymentDate: parsed.paymentDate,
    source: "gmail",
    fetchedAt,
    status: parsed.status,
    isProvisional: parsed.isProvisional,
    ...(parsed.errorCode ? { errorCode: parsed.errorCode } : {}),
  };
}
