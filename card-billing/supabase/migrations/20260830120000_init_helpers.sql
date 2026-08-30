-- =============================================================================
-- 共通の土台（スキーマ・ヘルパ関数）
--
-- ここで作る private スキーマは、OAuth トークンなどの秘密情報を置く専用領域。
-- PostgREST（Supabase の自動 REST API）へ公開しないため、ブラウザ用クライアント
-- からはテーブルの存在ごと到達できない。
-- =============================================================================

create schema if not exists private;

-- private スキーマはブラウザ由来のロールから完全に遮断する。
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

comment on schema private is
  'OAuth トークン等の秘密情報を格納する非公開スキーマ。PostgREST へ公開しないこと。';

-- -----------------------------------------------------------------------------
-- updated_at の自動更新
-- 各テーブルの UPDATE 時に呼ぶトリガー関数。アプリ側で updated_at を
-- 毎回セットする必要をなくす。
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'UPDATE 時に updated_at を now() へ自動更新するトリガー関数。';

revoke all on function public.set_updated_at() from public;
