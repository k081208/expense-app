import { Button } from "@/components/ui/button";
import { formatLastUpdated } from "@/lib/format";

/**
 * 「最新情報に更新」ボタンと、全体の最終更新表示。
 *
 * 実際に Gmail / API へ問い合わせる処理は STEP 10。
 * ここでは擬似的な更新処理を入れず、`action` が渡されていない間は
 * 無効のままにして「準備中」であることを支援技術にも伝える。
 * STEP 10 では `action`（Server Action）を渡すだけで動くようにしてある。
 */
export function RefreshPanel({
  lastUpdatedAt,
  action,
  now,
}: {
  /** 全カード中もっとも古い取得日時。未取得なら null。 */
  lastUpdatedAt: string | null;
  /** STEP 10 で差し込む更新処理。未指定なら無効化する。 */
  action?: (formData: FormData) => void | Promise<void>;
  now?: Date;
}) {
  const disabled = !action;

  const button = (
    <Button
      type="submit"
      disabled={disabled}
      aria-describedby={disabled ? "refresh-note" : undefined}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10 3.5a6.5 6.5 0 015.9 3.8l1.6-.7A8.25 8.25 0 0010 1.75c-2.4 0-4.55 1.02-6.06 2.65V2.5H2.19v5h5V5.75H4.86A6.47 6.47 0 0110 3.5z" />
        <path d="M10 16.5a6.5 6.5 0 01-5.9-3.8l-1.6.7A8.25 8.25 0 0010 18.25c2.4 0 4.55-1.02 6.06-2.65v1.9h1.75v-5h-5v1.75h2.33A6.47 6.47 0 0110 16.5z" />
      </svg>
      <span>最新情報に更新</span>
    </Button>
  );

  return (
    <section aria-labelledby="refresh-heading" className="space-y-2">
      <h2 id="refresh-heading" className="sr-only">
        更新
      </h2>

      {action ? <form action={action}>{button}</form> : button}

      <p className="text-center text-xs text-muted">
        最終更新：{formatLastUpdated(lastUpdatedAt, now)}
      </p>

      {disabled ? (
        <p id="refresh-note" className="text-center text-xs text-muted">
          更新機能は準備中です。
        </p>
      ) : null}
    </section>
  );
}
