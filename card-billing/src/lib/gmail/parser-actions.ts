"use server";

import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { gmailParserRegistry } from "@/providers/gmail/registry";
import { isGmailDiscoveryEnabled } from "./discovery-guard";
import type { GmailParserReport } from "./parser-plan";
import { runGmailParserPreview } from "./parser-run";

/**
 * Parser プレビューの Server Action。開発専用。
 *
 * 画面側の判定とは別に、ここでも必ず有効／無効を判定する
 * （探索と同じ ENABLE_GMAIL_DISCOVERY=1 かつ NODE_ENV !== production）。
 * 結果は画面に返すだけで、DB には書かない。
 */

export type ParserActionState =
  | { status: "idle" }
  | { status: "done"; report: GmailParserReport }
  | { status: "error"; code: "disabled" | "failed" };

export async function runGmailParserPreviewAction(
  _previous: ParserActionState,
  formData: FormData,
): Promise<ParserActionState> {
  if (!isGmailDiscoveryEnabled()) {
    return { status: "error", code: "disabled" };
  }

  const user = await requireUser();

  const days = Number(formData.get("days"));
  const maxMessages = Number(formData.get("maxMessages"));
  const providerKey = String(formData.get("provider") ?? "");
  const includeDebug = formData.get("includeDebug") === "on";

  try {
    const report = await runGmailParserPreview(user.id, {
      days: Number.isFinite(days) ? days : undefined,
      maxMessages: Number.isFinite(maxMessages) ? maxMessages : undefined,
      providerKey: gmailParserRegistry.get(providerKey) ? providerKey : null,
      includeDebug,
    });
    return { status: "done", report };
  } catch {
    logger.warn("請求メール解析のプレビューに失敗しました");
    return { status: "error", code: "failed" };
  }
}
