"use client";

import { useActionState, useId, useState } from "react";
import { SubmitButton } from "@/components/cards/submit-button";
import { Alert } from "@/components/ui/alert";
import { CARD_CATALOG, findCatalogEntry } from "@/lib/cards/catalog";
import type { CardFormState } from "@/lib/cards/actions";
import type { CardRow } from "@/types/database";

/**
 * カードの登録・編集フォーム。
 *
 * ラベルは常に表示し、エラーは色だけでなくアイコンと文言でも示す。
 * 入力欄は高さ 48px 以上を確保し、スマートフォンでも押しやすくしている。
 */

const FIELD =
  "w-full min-h-[48px] rounded-xl border border-border bg-surface px-3.5 " +
  "text-base text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "aria-[invalid=true]:border-danger";

const LABEL = "block text-sm font-medium";
const HINT = "mt-1 text-xs leading-relaxed text-muted";

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        className="mt-0.5 shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 3.5a.9.9 0 01.9.9v4.2a.9.9 0 11-1.8 0V6.4a.9.9 0 01.9-.9zm0 8.9a1.05 1.05 0 110-2.1 1.05 1.05 0 010 2.1z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        <span className="sr-only">エラー: </span>
        {children}
      </span>
    </p>
  );
}

export function CardForm({
  action,
  card,
  /** 請求情報が既にあるカードは、カード会社を変更できない。 */
  providerLocked = false,
  submitLabel,
}: {
  action: (state: CardFormState, formData: FormData) => Promise<CardFormState>;
  card?: CardRow;
  providerLocked?: boolean;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CardFormState, FormData>(action, {});
  const errors = state.errors ?? {};
  const isEdit = Boolean(card);
  const ids = useId();

  const [providerKey, setProviderKey] = useState(card?.provider_key ?? "");
  const [displayName, setDisplayName] = useState(card?.display_name ?? "");

  // カード会社を選んだら表示名を補う。既に入力済みの名前は上書きしない。
  function onProviderChange(nextKey: string) {
    const previous = findCatalogEntry(providerKey)?.shortName ?? "";
    setProviderKey(nextKey);
    if (!displayName || displayName === previous) {
      const entry = findCatalogEntry(nextKey);
      setDisplayName(entry?.requiresDisplayName ? "" : (entry?.shortName ?? ""));
    }
  }

  const needsOwnName =
    findCatalogEntry(providerKey)?.requiresDisplayName ?? false;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.message ? <Alert>{state.message}</Alert> : null}

      {/* カード会社 */}
      <div>
        <label className={LABEL} htmlFor={`${ids}-provider`}>
          カード会社
        </label>
        <select
          id={`${ids}-provider`}
          name="providerKey"
          required
          value={providerKey}
          onChange={(e) => onProviderChange(e.target.value)}
          disabled={providerLocked}
          aria-invalid={Boolean(errors.providerKey)}
          aria-describedby={
            errors.providerKey
              ? `${ids}-provider-error`
              : providerLocked
                ? `${ids}-provider-hint`
                : undefined
          }
          className={`${FIELD} mt-1.5 ${providerLocked ? "text-muted" : ""}`}
        >
          <option value="">選択してください</option>
          {CARD_CATALOG.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.name}
            </option>
          ))}
        </select>
        {providerLocked ? (
          <>
            {/* 変更させない場合も値は送るため hidden で保持する */}
            <input type="hidden" name="providerKey" value={providerKey} />
            <p id={`${ids}-provider-hint`} className={HINT}>
              このカードには既に請求情報があるため、カード会社は変更できません。
            </p>
          </>
        ) : null}
        {errors.providerKey ? (
          <FieldError id={`${ids}-provider-error`}>{errors.providerKey}</FieldError>
        ) : null}
      </div>

      {/* 表示名 */}
      <div>
        <label className={LABEL} htmlFor={`${ids}-name`}>
          カードの表示名
        </label>
        <input
          id={`${ids}-name`}
          name="displayName"
          type="text"
          required
          maxLength={60}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={needsOwnName ? "例: 〇〇カード" : "例: 楽天カード メイン"}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={
            errors.displayName ? `${ids}-name-error` : `${ids}-name-hint`
          }
          className={`${FIELD} mt-1.5`}
        />
        <p id={`${ids}-name-hint`} className={HINT}>
          {needsOwnName
            ? "カード会社名など、分かりやすい名前を入力してください（60 文字以内）。"
            : "同じカード会社を 2 枚持っている場合は「メイン」「店舗用」などを付けると区別できます（60 文字以内）。"}
        </p>
        {errors.displayName ? (
          <FieldError id={`${ids}-name-error`}>{errors.displayName}</FieldError>
        ) : null}
      </div>

      {/* カード番号下 4 桁 */}
      <div>
        <label className={LABEL} htmlFor={`${ids}-lastfour`}>
          カード番号下 4 桁（任意）
        </label>
        <input
          id={`${ids}-lastfour`}
          name="lastFour"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          pattern="[0-9]{4}"
          defaultValue={card?.last_four ?? ""}
          placeholder="1234"
          aria-invalid={Boolean(errors.lastFour)}
          aria-describedby={
            errors.lastFour ? `${ids}-lastfour-error` : `${ids}-lastfour-hint`
          }
          className={`${FIELD} tabular mt-1.5`}
        />
        <p id={`${ids}-lastfour-hint`} className={HINT}>
          下 4 桁だけを入力してください。カード番号すべてやセキュリティコードは
          入力しないでください。保存もされません。
        </p>
        {errors.lastFour ? (
          <FieldError id={`${ids}-lastfour-error`}>{errors.lastFour}</FieldError>
        ) : null}
      </div>

      {/* 標準支払日 */}
      <div>
        <label className={LABEL} htmlFor={`${ids}-day`}>
          毎月の支払日（任意）
        </label>
        <input
          id={`${ids}-day`}
          name="paymentDay"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          step={1}
          defaultValue={card?.payment_day ?? ""}
          placeholder="27"
          aria-invalid={Boolean(errors.paymentDay)}
          aria-describedby={
            errors.paymentDay ? `${ids}-day-error` : `${ids}-day-hint`
          }
          className={`${FIELD} tabular mt-1.5`}
        />
        <p id={`${ids}-day-hint`} className={HINT}>
          1〜31 の数字。目安として表示するもので、休日による前後のずれは
          反映されません。実際の支払日は請求情報を取得したときに分かります。
        </p>
        {errors.paymentDay ? (
          <FieldError id={`${ids}-day-error`}>{errors.paymentDay}</FieldError>
        ) : null}
      </div>

      {/* 取得方法 */}
      <fieldset>
        <legend className={LABEL}>請求情報の取得方法</legend>
        <p className={HINT}>
          どちらもまだ利用できません。連携の設定は後のステップで行います。
          ここでは希望だけを記録しておきます。
        </p>
        <div className="mt-2 space-y-2">
          {(
            [
              ["gmail", "メールから読み取る", "カード会社から届く請求のお知らせメールを使います。"],
              ["api", "カード会社と直接連携する", "カード会社が公式の連携方法を提供している場合に使います。"],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3.5 has-[:checked]:border-accent"
            >
              <input
                type="radio"
                name="preferredSource"
                value={value}
                defaultChecked={(card?.preferred_source ?? "gmail") === value}
                className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.preferredSource ? (
          <FieldError id={`${ids}-source-error`}>
            {errors.preferredSource}
          </FieldError>
        ) : null}
      </fieldset>

      {/* 有効 / 無効（編集時のみ） */}
      {isEdit ? (
        <label className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={card?.enabled ?? true}
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium">このカードを使う</span>
            <span className="block text-xs text-muted">
              外すとダッシュボードに表示されなくなります。登録は残ります。
            </span>
          </span>
        </label>
      ) : (
        // 新規登録は常に有効
        <input type="hidden" name="enabled" value="on" />
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
