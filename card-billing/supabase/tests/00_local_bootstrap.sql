-- =============================================================================
-- ローカル検証用のブートストラップ（Supabase へは適用しない）
--
-- Supabase 本体が用意しているロールと auth スキーマの最小構成を再現し、
-- 素の PostgreSQL 上でマイグレーションと RLS を検証できるようにする。
-- 本番の Supabase では既に存在するため、migrations/ には含めない。
-- =============================================================================

-- ロールはクラスタ全体で共有されるため、存在しない場合のみ作成する。
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Supabase と同じく、JWT の sub クレームから現在のユーザー ID を取り出す。
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase の既定の権限付与を再現する（public スキーマの新規テーブルに
-- 広い権限が自動付与される状態）。マイグレーション側の REVOKE が
-- 実際に効いているかを検証するために、あえて同じ状態を作る。
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
