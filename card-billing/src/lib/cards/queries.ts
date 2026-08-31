import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CardRow } from "@/types/database";

/**
 * カードの読み出し。
 *
 * いずれもログイン中ユーザーの通常セッションで実行する。RLS により
 * 自分の行しか返らないため、他人のカードを取得することはできない。
 * サービスロールは使わない。
 */

/** 並び順。作成順で固定し、同時刻なら表示名で決まるようにする。 */
function applyOrder<T extends { order: (col: string, opts?: object) => T }>(
  query: T,
): T {
  return query
    .order("created_at", { ascending: true })
    .order("display_name", { ascending: true });
}

/** 登録されている全カード（無効なものも含む）。カード管理画面で使う。 */
export async function listAllCards(): Promise<CardRow[]> {
  const supabase = await createClient();
  const { data, error } = await applyOrder(supabase.from("cards").select("*"));
  if (error) throw error;
  return data ?? [];
}

/** 有効なカードだけ。ダッシュボードで使う。 */
export async function listEnabledCards(): Promise<CardRow[]> {
  const supabase = await createClient();
  const { data, error } = await applyOrder(
    supabase.from("cards").select("*").eq("enabled", true),
  );
  if (error) throw error;
  return data ?? [];
}

/**
 * 1 枚のカードを取得する。見つからなければ null。
 *
 * RLS により他人のカードは 0 件として返るため、URL の id を書き換えても
 * 他人のカードは取得できない。呼び出し側は null を 404 として扱う。
 */
export async function findCard(cardId: string): Promise<CardRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("id", cardId)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

/**
 * そのカードに紐づく請求情報が既にあるか。
 * カード会社の変更を許可してよいかの判定に使う。
 */
export async function hasBillingRecords(cardId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("billing_records")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId);

  // 判断できない場合は「ある」とみなし、安全側（変更させない）に倒す
  if (error) return true;
  return (count ?? 0) > 0;
}
