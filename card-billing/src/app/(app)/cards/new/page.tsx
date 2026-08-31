import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { SectionCard } from "@/components/ui/section-card";
import { CardForm } from "@/components/cards/card-form";
import { createCard } from "@/lib/cards/actions";

export const metadata: Metadata = { title: "カードを登録" };
export const dynamic = "force-dynamic";

export default function NewCardPage() {
  return (
    <AppShell
      title="カードを登録"
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
        <CardForm action={createCard} submitLabel="このカードを登録" />
      </SectionCard>
    </AppShell>
  );
}
