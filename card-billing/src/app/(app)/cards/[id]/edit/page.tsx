import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { CardForm } from "@/components/cards/card-form";
import { updateCard } from "@/lib/cards/actions";
import { findCard, hasBillingRecords } from "@/lib/cards/queries";

export const metadata: Metadata = { title: "カードを編集" };
export const dynamic = "force-dynamic";

/**
 * カードの編集。
 *
 * RLS により他人のカードは取得できず、その場合は 404 として扱う。
 * URL の id を書き換えても、他人のカードの内容は表示されない。
 */
export default async function EditCardPage(
  props: PageProps<"/cards/[id]/edit">,
) {
  const { id } = await props.params;
  const card = await findCard(id);
  if (!card) notFound();

  // 請求情報が既にあるカードは、カード会社を変更させない
  const providerLocked = await hasBillingRecords(card.id);

  return (
    <AppShell
      title="カードを編集"
      action={
        <Link
          href="/cards"
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          もどる
        </Link>
      }
    >
      <SectionCard>
        <CardForm
          action={updateCard.bind(null, card.id)}
          card={card}
          providerLocked={providerLocked}
          submitLabel="変更を保存"
        />
      </SectionCard>
    </AppShell>
  );
}
