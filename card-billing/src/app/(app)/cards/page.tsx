import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { Alert } from "@/components/ui/alert";
import { CardListItem } from "@/components/cards/card-list-item";
import { listAllCards } from "@/lib/cards/queries";

export const metadata: Metadata = { title: "カード管理" };
export const dynamic = "force-dynamic";

/** 登録済みカードの一覧。無効にしたカードもここで確認・復帰できる。 */
export default async function CardsPage(props: PageProps<"/cards">) {
  const searchParams = await props.searchParams;
  const cards = await listAllCards();
  const enabledCount = cards.filter((card) => card.enabled).length;

  return (
    <AppShell
      title="カード管理"
      subtitle={
        cards.length === 0
          ? undefined
          : `${cards.length} 枚（使用中 ${enabledCount} 枚）`
      }
      action={
        <Link
          href="/"
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ダッシュボード
        </Link>
      }
    >
      <div className="space-y-4">
        {searchParams.added ? (
          <Alert tone="info">カードを登録しました。</Alert>
        ) : null}
        {searchParams.updated ? (
          <Alert tone="info">カードの内容を更新しました。</Alert>
        ) : null}

        <Link
          href="/cards/new"
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-base font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-[#0b1020]"
        >
          カードを登録
        </Link>

        {cards.length === 0 ? (
          <p className="px-1 text-sm leading-relaxed text-muted">
            まだカードが登録されていません。登録すると、次回の支払予定を
            ダッシュボードでまとめて確認できるようになります。
          </p>
        ) : (
          <ul className="space-y-3">
            {cards.map((card) => (
              <CardListItem key={card.id} card={card} />
            ))}
          </ul>
        )}

        <p className="px-1 text-xs leading-relaxed text-muted">
          請求メールをどの Gmail アカウントから読むかは{" "}
          <Link
            href="/settings/connections"
            className="rounded underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Gmail 連携
          </Link>{" "}
          で設定できます。
        </p>

        {cards.some((card) => !card.enabled) ? (
          <p className="px-1 text-xs leading-relaxed text-muted">
            「使用しない」にしたカードはダッシュボードに表示されませんが、
            登録は残ります。「使用する」を押せばいつでも戻せます。
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
