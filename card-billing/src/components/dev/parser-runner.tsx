"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { SectionCard } from "@/components/ui/section-card";
import { providerLabel } from "@/lib/cards/catalog";
import { formatLastFour, formatYen } from "@/lib/format";
import type { ParserActionState } from "@/lib/gmail/parser-actions";
import type { GmailParserTargetResult } from "@/lib/gmail/parser-plan";
import {
  DEFAULT_PARSER_LOOKBACK_DAYS,
  DEFAULT_PARSER_MAX_MESSAGES,
  PARSER_LOOKBACK_DAYS_CEILING,
  PARSER_MAX_MESSAGES_CEILING,
} from "@/providers/gmail/config/query";
import type { GmailMailClass, ParsedGmailBilling } from "@/providers/gmail/types";

/**
 * 開発専用: Parser プレビューの実行と結果表示。
 *
 * 受け取るのは解析結果だけ（本文・件名・message ID は含まれない）。
 * 下 4 桁は必ず伏字関数を通して表示する。
 */

const CLASS_LABEL: Record<GmailMailClass, string> = {
  confirmed: "確定",
  provisional: "予定",
  payment_notice: "引き落とし案内",
  changed: "変更",
  irrelevant: "対象外",
};

const ERROR_LABEL: Record<string, string> = {
  sender_mismatch: "送信元不一致",
  subject_mismatch: "件名が対象外",
  body_missing: "本文なし",
  body_decode_failed: "本文を復号できない",
  amount_parse_failed: "金額を読み取れない",
  amount_ambiguous: "金額が複数で決められない",
  payment_date_parse_failed: "支払日を読み取れない",
  card_match_ambiguous: "カードを 1 枚に絞れない",
  card_configuration_required: "下 4 桁の設定が必要",
  provider_unsupported: "未対応の会社",
};

function RunButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-[52px] w-full items-center justify-center rounded-xl px-5 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        pending
          ? "cursor-not-allowed border border-border text-muted"
          : "bg-brand text-white hover:opacity-90 dark:text-[#0b1020]"
      }`}
    >
      {pending ? "解析しています…（1 分ほどかかることがあります）" : "解析を実行"}
    </button>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

function MessageRow({ m, showDebug }: { m: ParsedGmailBilling; showDebug: boolean }) {
  const ok = m.status === "success";
  return (
    <li className="rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-muted">受信 {formatDateTime(m.sourceReceivedAt)}</span>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
            ok ? "bg-surface-muted text-foreground" : "bg-danger/10 text-danger"
          }`}
        >
          {ok ? "解析成功" : (ERROR_LABEL[m.errorCode ?? ""] ?? m.errorCode ?? "失敗")}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">種類</dt>
        <dd>
          {CLASS_LABEL[m.mailClass]}
          {m.mailClass !== "irrelevant" ? (m.isProvisional ? "（暫定）" : "（確定扱い）") : ""}
        </dd>
        <dt className="text-muted">カード</dt>
        <dd>
          {m.cardDisplayName ?? "—"}
          {m.cardLastFour ? <span className="ml-1 text-muted">{formatLastFour(m.cardLastFour)}</span> : null}
          {m.matchedBy === "last_four" ? <span className="ml-1 text-xs text-muted">下4桁で一致</span> : null}
          {m.matchedBy === "single_card" ? <span className="ml-1 text-xs text-muted">割り当てで決定</span> : null}
        </dd>
        <dt className="text-muted">金額</dt>
        <dd className="tabular">{formatYen(m.amount)}</dd>
        <dt className="text-muted">支払日</dt>
        <dd className="tabular">{m.paymentDate ?? "—"}</dd>
        {!ok && m.errorCode ? (
          <>
            <dt className="text-muted">分類</dt>
            <dd className="font-mono text-xs">{m.errorCode}</dd>
          </>
        ) : null}
      </dl>
      {showDebug && m.debug.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted">抽出過程（マスク済み）</summary>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
            {m.debug.map((d, i) => (
              <li key={i} className="break-all">
                {d}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

function TargetResult({ result, showDebug }: { result: GmailParserTargetResult; showDebug: boolean }) {
  return (
    <SectionCard title={providerLabel(result.providerKey)}>
      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted">割り当て済み Gmail</dt>
          <dd className="break-all">{result.accountEmailMasked}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted">対象カード</dt>
          <dd>{result.cardNames.join(" / ")}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted">検索 query</dt>
          <dd className="break-all font-mono text-xs">{result.query}</dd>
        </div>
        {result.tokenRefreshed ? (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted">トークン</dt>
            <dd>この解析中にアクセストークンの自動更新が発生しました</dd>
          </div>
        ) : null}
      </dl>

      {result.error ? (
        <div className="mt-3">
          <Alert>解析に失敗しました（分類: {result.error}）</Alert>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm">
            一致したメール：<span className="font-semibold">{result.listed} 件</span>
            {result.hasMore ? <span className="text-muted">（続きあり・今回は取りません）</span> : null}
          </p>

          <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted">採用候補（カードごとの次回請求）</h3>
          {result.current.length === 0 ? (
            <p className="text-sm text-muted">なし（解析に成功したメールがありません）</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {result.current.map((c) => (
                <li key={c.cardId ?? "?"} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>
                    {c.cardDisplayName}
                    {c.cardLastFour ? <span className="ml-1 text-muted">{formatLastFour(c.cardLastFour)}</span> : null}
                  </span>
                  <span className="tabular">
                    {formatYen(c.amount)} ／ {c.paymentDate ?? "支払日不明"} ／ {CLASS_LABEL[c.mailClass]}
                    {c.isProvisional ? "（暫定）" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted">メールごとの結果</h3>
          {result.messages.length === 0 ? (
            <p className="text-sm text-muted">なし</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {result.messages.map((m, i) => (
                <MessageRow key={`${m.sourceReceivedAt}-${i}`} m={m} showDebug={showDebug} />
              ))}
            </ul>
          )}

          {result.fetchErrors.length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              本文を取得できなかったメール:{" "}
              {result.fetchErrors.map((e) => `${e.category} ${e.count} 件`).join("、")}
            </p>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

export function ParserRunner({
  action,
  providers,
}: {
  action: (state: ParserActionState, formData: FormData) => Promise<ParserActionState>;
  providers: { key: string; label: string }[];
}) {
  const [state, formAction] = useActionState(action, { status: "idle" });

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">対象</span>
          <select
            name="provider"
            defaultValue=""
            className="min-h-[48px] w-full rounded-xl border border-border bg-surface px-3 text-base"
          >
            <option value="">すべての正式対応カード会社</option>
            {providers.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} だけ
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">期間（日）</span>
            <input
              type="number"
              name="days"
              min={1}
              max={PARSER_LOOKBACK_DAYS_CEILING}
              defaultValue={DEFAULT_PARSER_LOOKBACK_DAYS}
              className="min-h-[48px] w-full rounded-xl border border-border bg-surface px-3 text-base"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">1 単位の上限件数</span>
            <input
              type="number"
              name="maxMessages"
              min={1}
              max={PARSER_MAX_MESSAGES_CEILING}
              defaultValue={DEFAULT_PARSER_MAX_MESSAGES}
              className="min-h-[48px] w-full rounded-xl border border-border bg-surface px-3 text-base"
            />
          </label>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" name="includeDebug" className="h-5 w-5" defaultChecked />
          抽出過程を表示する（数字はマスクした行の形だけ。本文は出ません）
        </label>
        <RunButton />
      </form>

      {state.status === "error" ? (
        <Alert>
          {state.code === "disabled"
            ? "この機能は無効です（本番環境、または ENABLE_GMAIL_DISCOVERY が未設定）。"
            : "解析を実行できませんでした。開発サーバーのログを確認してください。"}
        </Alert>
      ) : null}

      {state.status === "done" ? (
        <>
          <p className="px-1 text-xs text-muted">
            実行 {formatDateTime(state.report.generatedAt)} ／ 過去 {state.report.days} 日 ／ 1 単位
            {state.report.maxMessages} 件まで
            {state.report.providerKey ? ` ／ 対象 ${providerLabel(state.report.providerKey)} のみ` : ""}
          </p>
          {state.report.results.length === 0 ? (
            <Alert tone="info">解析できる単位がありません。正式対応の会社のカードに Gmail を割り当ててください。</Alert>
          ) : (
            state.report.results.map((r) => (
              <TargetResult
                key={`${r.providerKey}:${r.connectionId}`}
                result={r}
                showDebug={state.report.includeDebug}
              />
            ))
          )}
          {state.report.plan.unsupportedCards.length > 0 ? (
            <p className="px-1 text-xs text-muted">
              未対応のため解析していないカード:{" "}
              {state.report.plan.unsupportedCards.map((c) => `${c.cardName}（${c.reason}）`).join(" / ")}
            </p>
          ) : null}
          {state.report.plan.unassignedCards.length > 0 ? (
            <p className="px-1 text-xs text-muted">
              割り当てが無いため解析していないカード:{" "}
              {state.report.plan.unassignedCards.map((c) => c.cardName).join(" / ")}
            </p>
          ) : null}
          {state.report.plan.inactiveConnectionCards.length > 0 ? (
            <p className="px-1 text-xs text-muted">
              連携が有効でないため解析していないカード:{" "}
              {state.report.plan.inactiveConnectionCards.map((c) => `${c.cardName}（${c.status}）`).join(" / ")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
