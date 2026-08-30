-- =============================================================================
-- connections : Google / 各社 API との連携情報
--
-- 【最重要】OAuth トークンをブラウザから取得できないようにするため、
-- 「接続状態」と「秘密情報」をテーブルごと分離する。
--
--   public.connections           … 接続状態のみ。秘密情報のカラムを持たない。
--                                  本人は SELECT できる（RLS）。
--   private.oauth_credentials    … 暗号化済みトークン。private スキーマにあり
--                                  PostgREST へ公開されないため、ブラウザ用
--                                  クライアントからは到達できない。
--
-- 「RLS で本人ならトークンを読める」という設計にはしていない。
-- 本人であってもブラウザからは秘密情報のテーブルに到達できない。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 接続状態（公開側）
-- -----------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- 連携の種類。'google' = Gmail 用の Google アカウント連携、
  -- 'api' = カード会社の公式 API 連携。
  kind text not null
    constraint connections_kind_allowed check (kind in ('google', 'api')),

  -- kind='api' のときの対象サービス。kind='google' では 'google' を入れる。
  provider_key text not null
    constraint connections_provider_key_format check (provider_key ~ '^[a-z0-9_]{2,40}$'),

  status text not null default 'connected'
    constraint connections_status_allowed
    check (status in ('connected', 'expired', 'revoked', 'error')),

  -- 許可されたスコープ。秘密情報ではないので画面に出してよい。
  scopes text[] not null default '{}',

  connected_at timestamptz,
  -- アクセストークンの有効期限。値そのものは秘密情報ではない。
  expires_at timestamptz,
  last_synced_at timestamptz,
  last_error_code text
    constraint connections_last_error_code_format
    check (last_error_code is null or last_error_code ~ '^[a-z_]{3,40}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint connections_user_kind_provider_key unique (user_id, kind, provider_key)
);

comment on table public.connections is
  '連携の「状態」だけを持つ公開テーブル。トークンは private.oauth_credentials にある。';
comment on column public.connections.expires_at is
  'アクセストークンの有効期限。トークン本体ではないため公開してよい。';

create trigger connections_set_updated_at
  before update on public.connections
  for each row execute function public.set_updated_at();

create index connections_user_id_idx on public.connections (user_id);

-- 権限と RLS
-- 連携の作成・更新・解除はすべてサーバー側（Server Action / Route Handler）で
-- 行うため、ブラウザには参照のみ許可する。
revoke all on table public.connections from public, anon, authenticated;
grant select on table public.connections to authenticated;
grant all on table public.connections to service_role;

alter table public.connections enable row level security;

create policy connections_select_own on public.connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- 秘密情報（非公開側）
--
-- トークンはアプリケーションサーバーで AES-256-GCM 暗号化してから保存する
-- （src/lib/crypto.ts）。DB には復号鍵を一切置かない。
-- -----------------------------------------------------------------------------
create table private.oauth_credentials (
  connection_id uuid primary key
    references public.connections (id) on delete cascade,

  -- 暗号文のみ。平文は保存しない。
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,

  -- 鍵ローテーションに備えた鍵バージョン。暗号文の先頭にも埋め込む。
  key_version smallint not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table private.oauth_credentials is
  '暗号化済み OAuth トークン。private スキーマのため PostgREST から到達できない。復号鍵は DB に置かない。';

create trigger oauth_credentials_set_updated_at
  before update on private.oauth_credentials
  for each row execute function public.set_updated_at();

-- 多重防御：スキーマ非公開に加えて、権限も RLS も全拒否にしておく。
revoke all on table private.oauth_credentials from public, anon, authenticated;
grant select, insert, update, delete on table private.oauth_credentials to service_role;

alter table private.oauth_credentials enable row level security;
-- ポリシーを 1 つも作らない = 誰にも許可しない（service_role のみ RLS を迂回）。

-- -----------------------------------------------------------------------------
-- トークンへのアクセス経路
--
-- サーバー専用処理は下記の関数経由でのみトークンを読み書きする。
-- EXECUTE 権限は service_role にのみ付与する（既定の PUBLIC 付与を取り消す）。
-- -----------------------------------------------------------------------------
create or replace function public.oauth_credentials_get(p_connection_id uuid)
returns table (
  access_token_encrypted text,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  key_version smallint
)
language sql
security definer
stable
set search_path = ''
as $$
  select c.access_token_encrypted,
         c.refresh_token_encrypted,
         c.access_token_expires_at,
         c.key_version
  from private.oauth_credentials as c
  where c.connection_id = p_connection_id;
$$;

revoke all on function public.oauth_credentials_get(uuid) from public, anon, authenticated;
grant execute on function public.oauth_credentials_get(uuid) to service_role;

comment on function public.oauth_credentials_get(uuid) is
  'サーバー専用。暗号化済みトークンを取得する。service_role のみ実行可能。';

create or replace function public.oauth_credentials_upsert(
  p_connection_id uuid,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text,
  p_access_token_expires_at timestamptz,
  p_key_version integer default 1
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.oauth_credentials as c (
    connection_id, access_token_encrypted, refresh_token_encrypted,
    access_token_expires_at, key_version
  )
  values (
    p_connection_id, p_access_token_encrypted, p_refresh_token_encrypted,
    p_access_token_expires_at, p_key_version::smallint
  )
  on conflict (connection_id) do update set
    access_token_encrypted  = excluded.access_token_encrypted,
    -- リフレッシュトークンは再発行されないことがあるため、
    -- 新しい値が無いときは既存の値を保持する。
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, c.refresh_token_encrypted),
    access_token_expires_at = excluded.access_token_expires_at,
    key_version             = excluded.key_version;
$$;

revoke all on function public.oauth_credentials_upsert(uuid, text, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.oauth_credentials_upsert(uuid, text, text, timestamptz, integer)
  to service_role;

comment on function public.oauth_credentials_upsert(uuid, text, text, timestamptz, integer) is
  'サーバー専用。暗号化済みトークンを保存する。service_role のみ実行可能。';

create or replace function public.oauth_credentials_delete(p_connection_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.oauth_credentials where connection_id = p_connection_id;
$$;

revoke all on function public.oauth_credentials_delete(uuid) from public, anon, authenticated;
grant execute on function public.oauth_credentials_delete(uuid) to service_role;

comment on function public.oauth_credentials_delete(uuid) is
  'サーバー専用。連携解除時にトークンを削除する。service_role のみ実行可能。';
