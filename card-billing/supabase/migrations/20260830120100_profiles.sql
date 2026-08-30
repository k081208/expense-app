-- =============================================================================
-- profiles : auth.users と 1 対 1 で対応するユーザー情報
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text
    constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'auth.users と 1 対 1 のユーザー情報。個人を特定できる情報はここに増やさないこと。';
comment on column public.profiles.id is 'auth.users.id と同一。';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 新規ユーザー登録時に profiles を自動作成する
--
-- auth.users への INSERT をトリガーに profiles 行を作る。アプリ側で
-- 「profile が無い場合に作る」分岐を持たなくて済む。
-- Google ログインそのものは STEP 3 で実装する。
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'auth.users 作成時に profiles を自動作成する。';

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 権限と RLS
--
-- 既定の権限を一度取り消してから必要な操作だけを付与する。
-- Supabase の既定では public スキーマの新規テーブルに広い権限が自動付与される
-- ため、明示的に絞り直さないと RLS だけが唯一の防御になってしまう。
-- -----------------------------------------------------------------------------
revoke all on table public.profiles from public, anon, authenticated;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

alter table public.profiles enable row level security;

-- 本人のみ参照できる
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- 本人のみ表示名を更新できる（id は変更させない）
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- INSERT は on_auth_user_created トリガー、DELETE は auth.users の
-- ON DELETE CASCADE に任せるため、クライアントには付与しない。
