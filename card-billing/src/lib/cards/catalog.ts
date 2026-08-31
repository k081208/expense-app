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
 * ここに並ぶのは、これまでのご依頼で名前が挙がったカード会社だけ。
 * 実在しないカード会社を勝手に増やすことはしない。
 *
 * 同じカード会社のカードを複数枚持つ場合も、キーは 1 つを共有する。
 * 例) 楽天ゴールドと楽天 PINK はどちらも `rakuten`、JCB 2 枚はどちらも `jcb`。
 * カードの区別は `display_name` と `cards.id` で行うため、券種ごとの
 * キーを増やす必要はない（増やすと Provider の実装も券種の数だけ必要になる）。
 *
 * 新しいカード会社に対応するときは、この配列へ 1 行追加するだけでよい。
 * `provider_key` は文字列のままなので、データベースの変更は不要。
 */
export const CARD_CATALOG: readonly CardCatalogEntry[] = [
  { key: "rakuten", name: "楽天カード", shortName: "楽天カード" },
  { key: "jcb", name: "JCBカード", shortName: "JCB" },
  { key: "amex", name: "アメリカン・エキスプレス", shortName: "AMEX" },
  { key: "paypay", name: "PayPayカード", shortName: "PayPayカード" },
  { key: "aupay", name: "au PAYカード", shortName: "au PAYカード" },
  { key: "aeon", name: "イオンカード", shortName: "イオンカード" },
  { key: "saison", name: "セゾンカード", shortName: "セゾンカード" },
  { key: "jaccs", name: "JACCSカード", shortName: "JACCSカード" },
  { key: "edion", name: "エディオンカード", shortName: "エディオンカード" },
  { key: "smbc", name: "三井住友カード", shortName: "三井住友カード" },
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
