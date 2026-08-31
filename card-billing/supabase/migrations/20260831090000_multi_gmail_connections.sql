-- =============================================================================
-- 複数の Google / Gmail アカウントを 1 人の利用者が連携できるようにする
--
-- 変更の要点
--   1. connections の一意制約を見直し、同じ利用者が Google アカウントを
--      2 つ以上つなげられるようにする
--   2. Google アカウントの識別に、メールアドレスではなく安定した一意 ID
--      （OpenID Connect の subject）を使えるようにする
--   3. カードごとに「どの連携から請求情報を取るか」を割り当てる中間テーブルを追加する
--
-- 変えないもの
--   - private.oauth_credentials（暗号化トークン）の構造と保護
--   - 1 つの連携につき 1 セットのトークンという関係
--   - billing_records の構造と一意制約
--   - 既存の RLS ポリシーの考え方
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. connections : 複数アカウント対応
-- -----------------------------------------------------------------------------

-- 種別の呼び方を整理する。
--   これまで: kind='google'（Google アカウント連携）
--   これから: kind='gmail' （請求メールの取得元）
-- 「何のサービスか」は provider_key が表し、kind は「何に使う連携か」を表す。
-- こうしておくと、割り当て側の source（gmail / api）とそのまま対応する。
update public.connections set kind = 'gmail' where kind = 'google';

alter table public.connections
  drop constraint if exists connections_kind_allowed;
alter table public.connections
  add constraint connections_kind_allowed check (kind in ('gmail', 'api'));

-- 連携先アカウントの安定した一意 ID。
-- Google の場合は OpenID Connect の subject (sub) を STEP 7 で保存する。
-- メールアドレスは変わりうるため、識別にはこちらを使う。
alter table public.connections
  add column if not exists external_account_id text
    constraint connections_external_account_id_length
    check (external_account_id is null or char_length(external_account_id) between 1 and 255);

-- 画面に「連携中: xxxx@gmail.com」と出すための表示用。
-- OAuth で取得した値のみを入れる。利用者に手入力させない。
-- 識別には使わない（下の一意制約にも含めるが、あくまで external_account_id が主）。
alter table public.connections
  add column if not exists account_email text
    constraint connections_account_email_format
    check (account_email is null
           or (account_email like '%@%' and char_length(account_email) <= 254));

-- Gmail の連携は、必ず安定した一意 ID を持つ。
-- （OAuth 完了時に必ず取得できるため、無い状態を作らせない）
alter table public.connections
  drop constraint if exists connections_gmail_needs_external_id;
alter table public.connections
  add constraint connections_gmail_needs_external_id
    check (kind <> 'gmail' or external_account_id is not null);

-- 旧: UNIQUE (user_id, kind, provider_key)
--     → 同じ利用者が Google 連携を 2 件持てなかった。
-- 新: 連携先アカウントまで含めて一意にする。
--     NULLS NOT DISTINCT により、external_account_id が NULL の連携（API など）も
--     「利用者 × 種別 × サービス」あたり 1 件に収まる。
alter table public.connections
  drop constraint if exists connections_user_kind_provider_key;
alter table public.connections
  add constraint connections_user_kind_provider_account_key
    unique nulls not distinct (user_id, kind, provider_key, external_account_id);

-- 割り当て側から複合外部キーで参照するための一意制約。
-- これにより「所有者が一致し、かつ種別と取得元が一致すること」を DB が保証できる。
alter table public.connections
  add constraint connections_user_id_id_kind_key unique (user_id, id, kind);

comment on column public.connections.external_account_id is
  '連携先アカウントの安定した一意 ID（Google は OpenID Connect の sub）。メールアドレスは識別に使わない。';
comment on column public.connections.account_email is
  '表示用のメールアドレス。OAuth で取得した値のみを入れる。識別の主キーにはしない。';
comment on column public.connections.kind is
  '連携の用途。gmail = 請求メールの取得元、api = カード会社の公式 API。割り当ての source と対応する。';

-- -----------------------------------------------------------------------------
-- 2. card_connection_assignments : カードと連携の割り当て
--
-- 1 枚のカードについて「どの連携から請求情報を取るか」を取得元ごとに 1 件持つ。
--   楽天ゴールド ─ gmail ─→ Gmail 連携 A
--                └ api   ─→ 楽天の API 連携（将来）
-- 割り当てが無い状態も正常（どの Gmail に届くか未確認のカードなど）。
-- -----------------------------------------------------------------------------
create table public.card_connection_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null,
  connection_id uuid not null,

  -- どの取得経路の割り当てか。connections.kind と一致していなければならない。
  source text not null
    constraint cca_source_allowed check (source in ('api', 'gmail')),

  -- 一時的に使わないときに false にする。割り当て自体は残る。
  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- カードの所有者と割り当ての所有者が一致することを DB で保証する
  constraint cca_card_fkey
    foreign key (user_id, card_id) references public.cards (user_id, id)
    on delete cascade,

  -- 連携の所有者が一致し、かつ source と連携の種別が一致することを DB で保証する。
  -- （他人の連携を割り当てる、Gmail 連携を api として割り当てる、のどちらも通らない）
  constraint cca_connection_fkey
    foreign key (user_id, connection_id, source)
    references public.connections (user_id, id, kind)
    on delete cascade,

  -- 1 枚のカードにつき、取得元ごとに 1 件だけ。
  -- 同じカードへ Gmail 連携を 2 つ同時に割り当てることはできない。
  -- 一方、gmail と api は source が違うので共存できる。
  constraint cca_card_source_key unique (card_id, source)
);

comment on table public.card_connection_assignments is
  'カードごとに、どの連携から請求情報を取得するかの割り当て。取得元ごとに 1 件。';
comment on column public.card_connection_assignments.source is
  '取得経路。connections.kind と一致する必要がある（複合外部キーで保証）。';

create trigger cca_set_updated_at
  before update on public.card_connection_assignments
  for each row execute function public.set_updated_at();

-- インデックス --------------------------------------------------------------
-- 利用者の割り当て一覧
create index cca_user_id_idx on public.card_connection_assignments (user_id);
-- 「この連携を使っているカードはどれか」（連携が切れたときの影響範囲の特定）
create index cca_connection_id_idx on public.card_connection_assignments (connection_id);
-- (card_id, source) は一意制約のインデックスが兼ねる

-- 権限と RLS ----------------------------------------------------------------
-- 割り当ての設定は利用者自身が行うため、本人のみ全操作を許可する。
revoke all on table public.card_connection_assignments from public, anon, authenticated;
grant select, insert, update, delete on table public.card_connection_assignments to authenticated;
grant all on table public.card_connection_assignments to service_role;

alter table public.card_connection_assignments enable row level security;

create policy cca_select_own on public.card_connection_assignments
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy cca_insert_own on public.card_connection_assignments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy cca_update_own on public.card_connection_assignments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy cca_delete_own on public.card_connection_assignments
  for delete to authenticated
  using ((select auth.uid()) = user_id);
