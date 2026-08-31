"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { validateCardForm, type CardFieldErrors } from "./validation";
import { findCard, hasBillingRecords } from "./queries";

/**
 * カードの登録・編集・有効無効の切り替え。
 *
 * すべてサーバー側で実行し、ログイン中ユーザーの通常の Supabase セッションと
 * RLS だけで処理する。サービスロールは使わない。
 *
 * user_id はフォームから受け取らない。必ずサーバー側で認証済みユーザーから
 * 決めるため、他人の user_id を指定して書き込むことはできない。
 */

/** フォームへ返す状態。エラーは項目ごとに返す。 */
export type CardFormState = {
  errors?: CardFieldErrors;
  /** 項目に紐づかないエラー（保存に失敗した場合など）。 */
  message?: string;
};

/** 保存に失敗したときの共通文言。DB のエラー内容は画面に出さない。 */
const SAVE_FAILED = "保存できませんでした。しばらくしてからもう一度お試しください。";

/**
 * 二重送信の判定に使う時間。
 * 送信ボタンの連打で同じカードが 2 枚できるのを防ぐ。
 * 同じカード会社を複数枚登録すること自体は禁止しない（表示名などが同じで、
 * かつ直前に登録されたものだけを重複とみなす）。
 */
const DUPLICATE_WINDOW_MS = 10_000;

export async function createCard(
  _prevState: CardFormState,
  formData: FormData,
): Promise<CardFormState> {
  const user = await requireUser();
  const result = validateCardForm(formData);
  if (!result.ok) return { errors: result.errors };

  const input = result.value;
  const supabase = await createClient();

  // --- 二重送信の抑止 -----------------------------------------------------
  // 直前に同じ内容のカードが登録されていれば、それは連打とみなして作らない。
  const { data: recent } = await supabase
    .from("cards")
    .select("id, created_at")
    .eq("provider_key", input.providerKey)
    .eq("display_name", input.displayName)
    .gte("created_at", new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString())
    .limit(1);

  if (!recent || recent.length === 0) {
    const { error } = await supabase.from("cards").insert({
      // フォームの値ではなく、認証済みユーザーの id を使う
      user_id: user.id,
      provider_key: input.providerKey,
      display_name: input.displayName,
      last_four: input.lastFour,
      payment_day: input.paymentDay,
      preferred_source: input.preferredSource,
      enabled: input.enabled,
    });

    if (error) {
      // DB のメッセージや SQL は画面へ出さない
      logger.warn("カードを登録できませんでした", { code: error.code });
      return { message: SAVE_FAILED };
    }
  }

  revalidatePath("/cards");
  revalidatePath("/");
  redirect("/cards?added=1");
}

export async function updateCard(
  cardId: string,
  _prevState: CardFormState,
  formData: FormData,
): Promise<CardFormState> {
  await requireUser();

  // 自分のカードでなければ RLS により見つからない
  const existing = await findCard(cardId);
  if (!existing) return { message: "カードが見つかりませんでした。" };

  const result = validateCardForm(formData);
  if (!result.ok) return { errors: result.errors };

  const input = result.value;

  // 請求情報が既にある場合、カード会社の変更は認めない。
  // 過去の請求が別のカード会社のものとして残ってしまうため。
  const locked = await hasBillingRecords(cardId);
  const providerKey = locked ? existing.provider_key : input.providerKey;

  const supabase = await createClient();
  const { error } = await supabase
    .from("cards")
    .update({
      provider_key: providerKey,
      display_name: input.displayName,
      last_four: input.lastFour,
      payment_day: input.paymentDay,
      preferred_source: input.preferredSource,
      enabled: input.enabled,
    })
    .eq("id", cardId);

  if (error) {
    logger.warn("カードを更新できませんでした", { code: error.code });
    return { message: SAVE_FAILED };
  }

  revalidatePath("/cards");
  revalidatePath("/");
  redirect("/cards?updated=1");
}

/**
 * 有効 / 無効の切り替え。
 *
 * 使わなくなったカードは削除せず無効にする。請求履歴を残せて、
 * 誤操作からも戻せるため。
 */
export async function setCardEnabled(formData: FormData): Promise<void> {
  await requireUser();

  const cardId = String(formData.get("cardId") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (!cardId) return;

  const supabase = await createClient();
  // 他人のカードは RLS により 0 件更新となる
  const { error } = await supabase
    .from("cards")
    .update({ enabled })
    .eq("id", cardId);

  if (error) {
    logger.warn("カードの有効状態を変更できませんでした", { code: error.code });
  }

  revalidatePath("/cards");
  revalidatePath("/");
}
