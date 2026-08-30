-- =============================================================================
-- cards : ユーザーが登録するクレジットカード
--
-- 【保存しないもの】カード番号の全桁 / セキュリティコード(CVV) /
--                   カード会社のログイン ID・パスワード
-- 保持してよいのは下 4 桁 (last_four) のみ。
-- =============================================================================

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Provider Registry のキー。カード会社を DB の enum で固定すると
  -- 新規カード会社の追加のたびにマイグレーションが必要になるため、
  -- 書式だけを検査する text とする。
  provider_key text not null
    constraint cards_provider_key_format check (provider_key ~ '^[a-z0-9_]{2,40}$'),

  display_name text not null
    constraint cards_display_name_length check (char_length(display_name) between 1 and 60),

  -- カード番号の下 4 桁のみ。未入力(NULL)可。値があるときは数字 4 桁だけ。
  last_four text
    constraint cards_last_four_format check (last_four ~ '^[0-9]{4}$'),

  -- 標準的な支払日(毎月何日か)。休日調整があるため目安として扱い、
  -- 正式な支払日は billing_records.payment_date で持つ。
  payment_day smallint
    constraint cards_payment_day_range check (payment_day between 1 and 31),

  preferred_source text not null default 'gmail'
    constraint cards_preferred_source_allowed check (preferred_source in ('api', 'gmail')),

  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- billing_records / fetch_logs から複合外部キーで参照するために必要。
  -- これにより「他人のカードに自分の user_id で請求を書き込む」ことが
  -- DB レベルで不可能になる。
  constraint cards_user_id_id_key unique (user_id, id)
);

comment on table public.cards is
  '登録カード。カード番号全桁・CVV・カード会社のパスワードは保存しない。';
comment on column public.cards.last_four is 'カード番号の下 4 桁のみ。NULL 可。';
comment on column public.cards.payment_day is '標準的な支払日 (1-31)。正式な日付は billing_records.payment_date。';
comment on column public.cards.provider_key is 'Provider Registry のキー。例: rakuten / smbc / amex / paypay。';

create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- インデックス --------------------------------------------------------------
-- ユーザーの全カード取得用
create index cards_user_id_idx on public.cards (user_id);
-- 有効なカードだけを走査する更新処理用（部分インデックス）
create index cards_user_id_enabled_idx on public.cards (user_id) where enabled;

-- 権限と RLS ----------------------------------------------------------------
revoke all on table public.cards from public, anon, authenticated;
grant select, insert, update, delete on table public.cards to authenticated;
grant all on table public.cards to service_role;

alter table public.cards enable row level security;

create policy cards_select_own on public.cards
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy cards_insert_own on public.cards
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy cards_update_own on public.cards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy cards_delete_own on public.cards
  for delete to authenticated
  using ((select auth.uid()) = user_id);
