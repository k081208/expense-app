-- =============================================================================
-- billing_records : カードごとの請求情報
--
-- 1 行 = 「カード × 取得元 × 支払日」の現在の請求情報。
-- 再取得しても行が増えないよう UPSERT 前提の一意制約を張る。
--
-- 【金額と状態の表し方】
--   status = 'success' … 金額を取得できた。amount は NOT NULL。
--                        0 は「請求額 0 円」という確定値であり、未取得ではない。
--   status = 'error'   … 取得できなかった。amount は NULL、error_code に理由。
--                        「請求額未確定」は error_code = 'amount_not_finalized'。
--   is_provisional     … 確定前の速報値・見込み額を取得した場合に true。
--                        （金額自体は取れているので status は 'success'）
-- TypeScript 側の BillingStatus ("success" | "error") と 1 対 1 に対応させ、
-- 状態を DB 側で増やさないことで両者のズレを防ぐ。
-- =============================================================================

create table public.billing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null,

  -- 日本円のため整数。小数は扱わない。未取得は NULL で表す。
  amount integer
    constraint billing_records_amount_non_negative check (amount is null or amount >= 0),

  payment_date date,

  source text not null
    constraint billing_records_source_allowed check (source in ('api', 'gmail')),

  status text not null
    constraint billing_records_status_allowed check (status in ('success', 'error')),

  is_provisional boolean not null default false,

  -- ProviderErrorCode（src/providers/errors.ts）と対応する内部コード。
  -- ユーザー向けの文言はアプリ側で変換するため、ここには保存しない。
  error_code text
    constraint billing_records_error_code_format
    check (error_code is null or error_code ~ '^[a-z_]{3,40}$'),

  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- カードの所有者と請求の所有者が必ず一致することを DB で保証する。
  -- 他人のカード ID を指定して自分の行として書き込むことができなくなる。
  constraint billing_records_card_fkey
    foreign key (user_id, card_id) references public.cards (user_id, id) on delete cascade,

  -- 成功なら必ず金額がある（0 円と未取得を明確に区別する）
  constraint billing_records_success_has_amount
    check (status = 'error' or amount is not null),

  -- 失敗なら必ず理由がある / 成功なら理由は持たない
  constraint billing_records_error_code_consistency
    check ((status = 'success' and error_code is null)
        or (status = 'error'   and error_code is not null)),

  -- 速報値フラグが立つのは金額を取得できたときだけ
  constraint billing_records_provisional_only_on_success
    check (not is_provisional or status = 'success'),

  -- 同じカード・同じ取得元・同じ支払日の請求は 1 行に保つ。
  -- NULLS NOT DISTINCT により、支払日が不明(NULL)な行も
  -- 「カード × 取得元」あたり 1 行に収束し、失敗のたびに行が増えない。
  constraint billing_records_slot_key
    unique nulls not distinct (card_id, source, payment_date)
);

comment on table public.billing_records is
  'カード × 取得元 × 支払日 ごとの現在の請求情報。再取得時は UPSERT する。';
comment on column public.billing_records.amount is
  '請求金額（円・整数）。NULL は未取得。0 は「0 円」という確定値。';
comment on column public.billing_records.is_provisional is
  '確定前の速報値・見込み額なら true。';
comment on column public.billing_records.error_code is
  'ProviderErrorCode に対応する内部コード。機密情報は入れない。';

create trigger billing_records_set_updated_at
  before update on public.billing_records
  for each row execute function public.set_updated_at();

-- インデックス --------------------------------------------------------------
-- 支払日別の合計（ダッシュボードの主クエリ）。成功行だけを対象にする。
create index billing_records_user_payment_date_idx
  on public.billing_records (user_id, payment_date)
  where status = 'success';

-- カードごとの最新の取得結果
create index billing_records_card_fetched_at_idx
  on public.billing_records (card_id, fetched_at desc);

-- 一意制約 billing_records_slot_key のインデックスが
-- (card_id, source, payment_date) の検索も兼ねる。

-- 権限と RLS ----------------------------------------------------------------
-- 請求情報を書き込むのは取得パイプライン（サーバー側のサービスロール処理）だけ。
-- ブラウザからは参照のみできればよいため、書き込み権限は付与しない。
revoke all on table public.billing_records from public, anon, authenticated;
grant select on table public.billing_records to authenticated;
grant all on table public.billing_records to service_role;

alter table public.billing_records enable row level security;

create policy billing_records_select_own on public.billing_records
  for select to authenticated
  using ((select auth.uid()) = user_id);
