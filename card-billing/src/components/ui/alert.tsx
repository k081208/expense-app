import type { ReactNode } from "react";

/**
 * 通知の表示。
 *
 * 色だけで意味を伝えないよう、アイコンと「エラー」等の見出し語も添える。
 * エラーは支援技術にも伝わるよう role="alert" を付ける。
 */
export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  const isError = tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border p-4 text-sm ${
        isError
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-border bg-surface-muted text-muted"
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        className="mt-0.5 shrink-0"
      >
        {isError ? (
          <path
            fillRule="evenodd"
            d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 3.5a.9.9 0 01.9.9v4.2a.9.9 0 11-1.8 0V6.4a.9.9 0 01.9-.9zm0 8.9a1.05 1.05 0 110-2.1 1.05 1.05 0 010 2.1z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M10 2a8 8 0 100 16 8 8 0 000-16zm.9 5.6a.9.9 0 10-1.8 0 .9.9 0 001.8 0zM9.1 9.5a.9.9 0 011.8 0v4.1a.9.9 0 11-1.8 0V9.5z"
            clipRule="evenodd"
          />
        )}
      </svg>
      <p>
        <span className="sr-only">{isError ? "エラー: " : "お知らせ: "}</span>
        {children}
      </p>
    </div>
  );
}
