import type { BillingSource } from "@/types/billing";
import { isKnownProviderKey } from "./catalog";

/**
 * カード登録・編集の入力検証。
 *
 * STEP 2 のデータベース制約と 1 対 1 で対応させている。
 * 画面で弾いた場合でも、最後は DB の CHECK 制約が同じ条件で守る二重の作り。
 *
 * 検証ライブラリは新たに追加していない。項目が 6 つで条件も単純なため、
 * 依存を増やすより標準の TypeScript で書いたほうが読みやすく、
 * DB 制約との対応も確認しやすいと判断した。
 */

/** 項目名 → エラー文言。どう直せばよいかまで書く。 */
export type CardFieldErrors = Partial<
  Record<
    "providerKey" | "displayName" | "lastFour" | "paymentDay" | "preferredSource",
    string
  >
>;

/** 検証を通ったあとの値。そのまま DB へ渡せる形にする。 */
export type CardInput = {
  providerKey: string;
  displayName: string;
  lastFour: string | null;
  paymentDay: number | null;
  preferredSource: BillingSource;
  enabled: boolean;
};

export type ValidationResult =
  | { ok: true; value: CardInput }
  | { ok: false; errors: CardFieldErrors };

const trimmed = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * フォームの入力を検証する。
 *
 * 検証するのは利用者が入力する項目だけ。user_id は絶対にフォームから取らず、
 * サーバー側でログイン中のユーザーから決める。
 */
export function validateCardForm(formData: FormData): ValidationResult {
  const errors: CardFieldErrors = {};

  // --- カード会社 ---------------------------------------------------------
  const providerKey = trimmed(formData.get("providerKey"));
  if (!providerKey) {
    errors.providerKey = "カード会社を選択してください。";
  } else if (!isKnownProviderKey(providerKey)) {
    // 画面の選択肢に無い値が送られてきた場合（改ざんなど）
    errors.providerKey = "選択できないカード会社です。一覧から選び直してください。";
  }

  // --- 表示名 -------------------------------------------------------------
  const displayName = trimmed(formData.get("displayName"));
  if (!displayName) {
    errors.displayName = "カードの表示名を入力してください。";
  } else if ([...displayName].length > 60) {
    errors.displayName = "カードの表示名は 60 文字以内で入力してください。";
  }

  // --- カード番号下 4 桁（任意）-------------------------------------------
  const lastFourRaw = trimmed(formData.get("lastFour"));
  let lastFour: string | null = null;
  if (lastFourRaw) {
    if (!/^[0-9]{4}$/.test(lastFourRaw)) {
      errors.lastFour = "カード番号下 4 桁は数字 4 桁で入力してください。";
    } else {
      lastFour = lastFourRaw;
    }
  }

  // --- 標準支払日（任意）-------------------------------------------------
  const paymentDayRaw = trimmed(formData.get("paymentDay"));
  let paymentDay: number | null = null;
  if (paymentDayRaw) {
    const parsed = Number(paymentDayRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      errors.paymentDay = "支払日は 1〜31 の数字で入力してください。";
    } else {
      paymentDay = parsed;
    }
  }

  // --- 取得方法 -----------------------------------------------------------
  const preferredSourceRaw = trimmed(formData.get("preferredSource"));
  if (preferredSourceRaw !== "api" && preferredSourceRaw !== "gmail") {
    errors.preferredSource = "請求情報の取得方法を選択してください。";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      providerKey,
      displayName,
      lastFour,
      paymentDay,
      preferredSource: preferredSourceRaw as BillingSource,
      // チェックボックスは未チェックだと値が送られてこない
      enabled: formData.get("enabled") !== null,
    },
  };
}
