"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { SectionCard } from "@/components/ui/section-card";
import { providerLabel } from "@/lib/cards/catalog";
import type { DiscoveryActionState } from "@/lib/gmail/discovery-actions";
import {
  DEFAULT_DISCOVERY_DAYS,
  DEFAULT_DISCOVERY_MAX_RESULTS,
  DISCOVERY_DAYS_CEILING,
  DISCOVERY_MAX_RESULTS_CEILING,
  type DiscoveryTargetResult,
} from "@/lib/gmail/discovery";

/**
 * 開発専用: 請求メール探索の実行と結果表示。
 *
 * 表示するのは集計結果だけ。件名は可変部分を置き換えたテンプレート、
 * Gmail アカウントはマスク済み。本文・snippet・message ID は受け取らない。
 */

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
      {pending ? "探索しています…（1〜2 分かかることがあります）" : "探索を実行"}
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

function TargetResult({ result }: { result: DiscoveryTargetResult }) {
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
            <dd>この探索中にアクセストークンの自動更新が発生しました</dd>
          </div>
        ) : null}
      </dl>

      {result.error ? (
        <div className="mt-3">
          <Alert>探索に失敗しました（分類: {result.error}）</Alert>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm">
            候補メール：<span className="font-semibold">{result.aggregate.candidateCount} 件</span>
            <span className="text-muted">
              （Gmail の推定 {result.resultSizeEstimate} 件
              {result.hasMore ? "・続きあり" : ""}）
            </span>
          </p>
          <p className="text-xs text-muted">
            最新 {formatDateTime(result.aggregate.latestAt)} ／ 最古{" "}
            {formatDateTime(result.aggregate.oldestAt)}
          </p>

          <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted">送信元候補</h3>
          {result.aggregate.fromCounts.length === 0 ? (
            <p className="text-sm text-muted">なし</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {result.aggregate.fromCounts.map((f) => (
                <li key={f.address} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-all">
                    <span className="font-mono text-xs">{f.address}</span>
                    {f.name ? <span className="ml-1 text-muted">（{f.name}）</span> : null}
                  </span>
                  <span className="shrink-0 tabular">{f.count} 件</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted">件名パターン候補</h3>
          {result.aggregate.subjectTemplates.length === 0 ? (
            <p className="text-sm text-muted">なし</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {result.aggregate.subjectTemplates.map((s) => (
                <li key={s.template} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words">「{s.template}」</span>
                  <span className="shrink-0 tabular">{s.count} 件</span>
                </li>
              ))}
            </ul>
          )}

          {result.fetchErrors.length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              ヘッダーを取得できなかった候補:{" "}
              {result.fetchErrors.map((e) => `${e.category} ${e.count} 件`).join("、")}
            </p>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

export function DiscoveryRunner({
  action,
  providers,
}: {
  action: (state: DiscoveryActionState, formData: FormData) => Promise<DiscoveryActionState>;
  /** 探索できるカード会社（割り当てのある単位から作る） */
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
            <option value="">すべてのカード会社</option>
            {providers.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} だけ
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">検索条件の追加（任意）</span>
          <input
            type="text"
            name="extraQuery"
            maxLength={200}
            placeholder="例: from:example.co.jp"
            autoComplete="off"
            className="min-h-[48px] w-full rounded-xl border border-border bg-surface px-3 font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-muted">
            探索結果で見つかった送信元で絞り込むときに使います。Gmail の検索演算子をそのまま書けます。
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">期間（日）</span>
            <input
              type="number"
              name="days"
              min={1}
              max={DISCOVERY_DAYS_CEILING}
              defaultValue={DEFAULT_DISCOVERY_DAYS}
              className="min-h-[48px] w-full rounded-xl border border-border bg-surface px-3 text-base"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">上限件数</span>
            <input
              type="number"
              name="maxResults"
              min={1}
              max={DISCOVERY_MAX_RESULTS_CEILING}
              defaultValue={DEFAULT_DISCOVERY_MAX_RESULTS}
              className="min-h-[48px] w-full rounded-xl border border-border bg-surface px-3 text-base"
            />
          </label>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" name="includeSpamTrash" className="h-5 w-5" />
          迷惑メール・ゴミ箱も含める（通常は不要）
        </label>
        <RunButton />
      </form>

      {state.status === "error" ? (
        <Alert>
          {state.code === "disabled"
            ? "この機能は無効です（本番環境、または ENABLE_GMAIL_DISCOVERY が未設定）。"
            : "探索を実行できませんでした。開発サーバーのログを確認してください。"}
        </Alert>
      ) : null}

      {state.status === "done" ? (
        <>
          <p className="px-1 text-xs text-muted">
            実行 {formatDateTime(state.report.generatedAt)} ／ 過去 {state.report.days} 日 ／
            上限 {state.report.maxResults} 件 ／ 迷惑メール・ゴミ箱{" "}
            {state.report.includeSpamTrash ? "含む" : "除外"}
            {state.report.providerKey ? ` ／ 対象 ${providerLabel(state.report.providerKey)} のみ` : ""}
            {state.report.extraQuery ? ` ／ 追加条件 ${state.report.extraQuery}` : ""}
          </p>
          {state.report.results.length === 0 ? (
            <Alert tone="info">探索できる単位がありません。カードに Gmail を割り当ててください。</Alert>
          ) : (
            state.report.results.map((r) => (
              <TargetResult key={`${r.providerKey}:${r.connectionId}`} result={r} />
            ))
          )}
          {state.report.plan.unassignedCards.length > 0 ? (
            <p className="px-1 text-xs text-muted">
              割り当てが無いため探索していないカード:{" "}
              {state.report.plan.unassignedCards.map((c) => c.cardName).join(" / ")}
            </p>
          ) : null}
          {state.report.plan.inactiveConnectionCards.length > 0 ? (
            <p className="px-1 text-xs text-muted">
              連携が有効でないため探索していないカード:{" "}
              {state.report.plan.inactiveConnectionCards
                .map((c) => `${c.cardName}（${c.status}）`)
                .join(" / ")}
            </p>
          ) : null}
          {state.report.plan.unsupportedCards.length > 0 ? (
            <p className="px-1 text-xs text-muted">
              探索語を用意していないカード会社:{" "}
              {state.report.plan.unsupportedCards.map((c) => c.cardName).join(" / ")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
