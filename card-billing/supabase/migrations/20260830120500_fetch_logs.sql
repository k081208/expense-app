-- =============================================================================
-- fetch_logs : 取得処理の実行履歴
--
-- 【保存しないもの】OAuth トークン / メール本文 / カード番号 /
--                   個人情報 / API レスポンス全文
-- 保存してよいのは内部エラーコードと、ユーザーに見せても安全な短い文言だけ。
-- =============================================================================

create table public.fetch_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- 連携単位の失敗（カードを特定する前に失敗した場合）は NULL になりうる。
  card_id uuid,

  source text
    constraint fetch_logs_source_allowed check (source is null or source in ('api', 'gmail')),

  status text not null
    constraint fetch_logs_status_allowed check (status in ('success', 'error')),

  -- ProviderErrorCode に対応する内部コード。
  error_code text
    constraint fetch_logs_error_code_format
    check (error_code is null or error_code ~ '^[a-z_]{3,40}$'),

  -- 機密情報を含めないこと。長さも制限して、レスポンス全文などを
  -- 誤って書き込めないようにする。
  message text
    constraint fetch_logs_message_length check (message is null or char_length(message) <= 200),

  created_at timestamptz not null default now(),

  constraint fetch_logs_error_code_consistency
    check ((status = 'success' and error_code is null)
        or (status = 'error'   and error_code is not null)),

  -- カードの所有者とログの所有者を一致させる。
  -- card_id が NULL のときは検査されない（MATCH SIMPLE）。
  constraint fetch_logs_card_fkey
    foreign key (user_id, card_id) references public.cards (user_id, id) on delete cascade
);

comment on table public.fetch_logs is
  '取得処理の実行履歴。トークン・メール本文・カード番号・API レスポンス全文は保存しない。';
comment on column public.fetch_logs.message is
  'ユーザーに見せても安全な短い文言のみ（200 文字以内）。機密情報を含めないこと。';

-- インデックス --------------------------------------------------------------
-- カードごとの最新ログ
create index fetch_logs_card_created_at_idx
  on public.fetch_logs (card_id, created_at desc);
-- ユーザー単位の最新ログ（カード未特定のログも拾えるようにする）
create index fetch_logs_user_created_at_idx
  on public.fetch_logs (user_id, created_at desc);

-- 権限と RLS ----------------------------------------------------------------
-- ログを書き込むのは取得パイプライン（サーバー側）だけ。
-- クライアントから自由に INSERT できる必要はないため、参照のみ許可する。
revoke all on table public.fetch_logs from public, anon, authenticated;
grant select on table public.fetch_logs to authenticated;
grant all on table public.fetch_logs to service_role;

alter table public.fetch_logs enable row level security;

create policy fetch_logs_select_own on public.fetch_logs
  for select to authenticated
  using ((select auth.uid()) = user_id);
