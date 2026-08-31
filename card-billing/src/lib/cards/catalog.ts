/**
 * 登録できるカード会社の一覧（Supported Card Catalog）。
 *
 * 【Provider Registry との違い】
 *   このカタログ … アプリに「登録できる」カード会社。表示名などの基本情報だけを持つ。
 *   Provider Registry (`src/providers/registry.ts`)
 *                  … 請求情報を実際に「取得できる」実装の登録簿。
 *
 * 取得の実装（メール解析は STEP 8、公式 API は STEP 9）はまだ存在しないため、
 * 登録できるカード会社を Provider Registry から生成することはしない。
 * 両者を分けておくことで、
 *   - 取得に未対応のカードでも先に登録できる
 *   - 取得へ対応したときにカタログ側を変えずに済む
 * という関係になる。
 *
 * 【重要】ここに「API 対応」「Gmail 自動取得対応」といった情報は持たせない。
 * 公式 API の有無やメールの取得可否は STEP 9 / STEP 8 で実際に調べて決めることで、
 * カード会社を選んだ時点で決めつけてはいけない。
 */

export type CardCatalogEntry = {
  /** cards.provider_key に保存する内部キー。DB の enum にはしない。 */
  key: string;
  /** 正式名称。 */
  name: string;
  /** 画面で使う短い名前。登録時の表示名の初期値にも使う。 */
  shortName: string;
  /**
   * 利用者が表示名を自分で入力する必要があるか。
   * 「その他」はカード会社名が決まらないため true。
   */
  requiresDisplayName?: boolean;
};

/**
 * 登録できるカード会社。
 *
 * 最初の 4 社は、本アプリの要件で名前が挙がっているカード会社をそのまま採用している
 * （STEP 2 の cards.provider_key のコメントにも同じキーを記載済み）。
 * 実在しないカード会社を勝手に増やすことはしない。
 *
 * 新しいカード会社に対応するときは、この配列へ 1 行追加するだけでよい。
 * `provider_key` は文字列のままなので、データベースの変更は不要。
 */
export const CARD_CATALOG: readonly CardCatalogEntry[] = [
  { key: "rakuten", name: "楽天カード", shortName: "楽天カード" },
  { key: "smbc", name: "三井住友カード", shortName: "三井住友カード" },
  { key: "amex", name: "アメリカン・エキスプレス", shortName: "AMEX" },
  { key: "paypay", name: "PayPayカード", shortName: "PayPayカード" },
  {
    key: "other",
    name: "その他のカード",
    shortName: "その他",
    requiresDisplayName: true,
  },
] as const;

/** 「その他」を表す内部キー。利用者の入力値をそのまま provider_key にはしない。 */
export const OTHER_PROVIDER_KEY = "other";

export function findCatalogEntry(key: string): CardCatalogEntry | undefined {
  return CARD_CATALOG.find((entry) => entry.key === key);
}

export function isKnownProviderKey(key: unknown): key is string {
  return typeof key === "string" && CARD_CATALOG.some((e) => e.key === key);
}

/**
 * 画面に出すカード会社名。
 * カタログに無いキー（カタログから削除された後も残っているカードなど）でも
 * 画面が壊れないよう、保存されている表示名側で補えるようにしている。
 */
export function providerLabel(key: string): string {
  return findCatalogEntry(key)?.shortName ?? "その他";
}
