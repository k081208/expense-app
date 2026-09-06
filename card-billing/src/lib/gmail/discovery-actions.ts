"use server";

import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { isGmailDiscoveryEnabled } from "./discovery-guard";
import { runGmailDiscovery } from "./discovery-run";
import { isDiscoverableProvider, type DiscoveryReport } from "./discovery";

/**
 * 探索（Discovery）の Server Action。開発専用。
 *
 * 画面側の判定とは別に、ここでも必ず有効／無効を判定する。
 * URL や Action を直接叩いても、本番では何も実行されない。
 */

export type DiscoveryActionState =
  | { status: "idle" }
  | { status: "done"; report: DiscoveryReport }
  | { status: "error"; code: "disabled" | "failed" };

export async function runGmailDiscoveryAction(
  _previous: DiscoveryActionState,
  formData: FormData,
): Promise<DiscoveryActionState> {
  if (!isGmailDiscoveryEnabled()) {
    return { status: "error", code: "disabled" };
  }

  const user = await requireUser();

  const days = Number(formData.get("days"));
  const maxResults = Number(formData.get("maxResults"));
  const includeSpamTrash = formData.get("includeSpamTrash") === "on";
  const providerKey = String(formData.get("provider") ?? "");
  const extraQuery = String(formData.get("extraQuery") ?? "");

  try {
    const report = await runGmailDiscovery(user.id, {
      days: Number.isFinite(days) ? days : undefined,
      maxResults: Number.isFinite(maxResults) ? maxResults : undefined,
      includeSpamTrash,
      // 探索語を持つ会社のキー以外は「すべて」として扱う
      providerKey: isDiscoverableProvider(providerKey) ? providerKey : null,
      extraQuery,
    });
    return { status: "done", report };
  } catch {
    // 詳細は logger 側で分類済み。画面には失敗した事実だけを返す。
    logger.warn("探索の実行に失敗しました");
    return { status: "error", code: "failed" };
  }
}
