-- =============================================================================
-- RLS / セキュリティ検証
--
-- ユーザー A・B を作り、実際に authenticated ロールへ切り替えて
-- 「見えるべきものが見え、見えてはいけないものが見えない」ことを確認する。
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages to notice;
-- 検証結果は NOTICE で出すため、クエリの戻り値は捨てる
\o /dev/null

create schema test;

create or replace function test.ok(desc_ text, cond boolean) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', desc_;
  end if;
  raise notice '  PASS  %', desc_;
end $$;

-- 実行できてはいけない文を検証する（権限エラー・制約違反のいずれでも合格）
create or replace function test.denied(desc_ text, stmt text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice '  PASS  % [%]', desc_, sqlstate;
    return;
  end;
  raise exception 'FAIL: % — 実行できてしまった', desc_;
end $$;

grant usage on schema test to public;
grant execute on all functions in schema test to public;

-- -----------------------------------------------------------------------------
-- テストデータ（postgres ロールで作成）
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@example.test', '{"full_name":"User A"}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@example.test', '{"full_name":"User B"}');

\echo ''
\echo '--- 1. profiles 自動作成トリガー ---'
select test.ok('auth.users 作成時に profiles が自動作成される',
  (select count(*) from public.profiles) = 2);
select test.ok('display_name が user metadata から引き継がれる',
  (select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'User A');

-- カードと請求を A / B それぞれに用意する
insert into public.cards (id, user_id, provider_key, display_name, last_four, payment_day, preferred_source)
values
  ('c1111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'rakuten', '楽天カード', '1234', 27, 'gmail'),
  ('c2222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'smbc',    '三井住友カード', null, 10, 'api');

insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001', 82400, '2026-09-27', 'gmail', 'success'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'c2222222-0000-4000-8000-000000000002', 54200, '2026-09-10', 'api',   'success');

insert into public.connections (id, user_id, kind, provider_key, external_account_id, scopes)
values ('e1111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'gmail', 'google',
        'test-google-sub-a',
        array['https://www.googleapis.com/auth/gmail.readonly']);

select public.oauth_credentials_upsert(
  'e1111111-0000-4000-8000-000000000001',
  'v1.ENCRYPTED-ACCESS-TOKEN', 'v1.ENCRYPTED-REFRESH-TOKEN', now() + interval '1 hour', 1);

insert into public.fetch_logs (user_id, card_id, source, status, error_code, message)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
        'gmail', 'error', 'mail_not_found', '請求のお知らせメールが見つかりませんでした');

-- =============================================================================
\echo ''
\echo '--- 2. ユーザー A は自分のデータを扱える ---'
set role authenticated;
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select test.ok('A: 自分の cards を取得できる',          (select count(*) from public.cards) = 1);
select test.ok('A: 自分の billing_records を取得できる', (select count(*) from public.billing_records) = 1);
select test.ok('A: 自分の profiles を取得できる',        (select count(*) from public.profiles) = 1);
select test.ok('A: 自分の connections を取得できる',     (select count(*) from public.connections) = 1);
select test.ok('A: 自分の fetch_logs を取得できる',      (select count(*) from public.fetch_logs) = 1);

update public.cards set display_name = '楽天カード(メイン)'
  where id = 'c1111111-0000-4000-8000-000000000001';
select test.ok('A: 自分の cards を更新できる',
  (select display_name from public.cards where id = 'c1111111-0000-4000-8000-000000000001') = '楽天カード(メイン)');

insert into public.cards (user_id, provider_key, display_name)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'amex', 'AMEX');
select test.ok('A: 自分の cards を追加できる', (select count(*) from public.cards) = 2);

delete from public.cards where provider_key = 'amex';
select test.ok('A: 自分の cards を削除できる', (select count(*) from public.cards) = 1);

update public.profiles set display_name = 'あああ' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select test.ok('A: 自分の profiles を更新できる',
  (select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'あああ');

-- =============================================================================
\echo ''
\echo '--- 3. ユーザー B から A のデータへアクセスできない ---'
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

select test.ok('B: A の cards は見えない',
  (select count(*) from public.cards where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0);
select test.ok('B: A の billing_records は見えない',
  (select count(*) from public.billing_records where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0);
select test.ok('B: A の profiles は見えない',
  (select count(*) from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0);
select test.ok('B: A の connections は見えない',
  (select count(*) from public.connections where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0);
select test.ok('B: A の fetch_logs は見えない',
  (select count(*) from public.fetch_logs where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0);
select test.ok('B: 自分のデータは見える', (select count(*) from public.cards) = 1);

update public.cards set display_name = 'のっとり' where id = 'c1111111-0000-4000-8000-000000000001';
select test.ok('B: A の cards を更新できない（0 行）',
  (select count(*) from public.cards where display_name = 'のっとり') = 0);

delete from public.cards where id = 'c1111111-0000-4000-8000-000000000001';
reset role;
select test.ok('B: A の cards を削除できない',
  (select count(*) from public.cards where id = 'c1111111-0000-4000-8000-000000000001') = 1);
set role authenticated;
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

select test.denied('B: A の user_id でカードを作成できない',
  $$insert into public.cards (user_id, provider_key, display_name)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'evil', 'なりすまし')$$);

select test.denied('B: A のカードに紐づく請求を自分の user_id で作成できない',
  $$insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'c1111111-0000-4000-8000-000000000001',
            1, '2026-09-27', 'gmail', 'success')$$);

-- =============================================================================
\echo ''
\echo '--- 4. 書き込みは最小権限（サーバー処理のみ） ---'
select test.denied('billing_records へクライアントから INSERT できない',
  $$insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'c2222222-0000-4000-8000-000000000002',
            1, '2026-10-10', 'api', 'success')$$);
select test.denied('billing_records をクライアントから UPDATE できない',
  $$update public.billing_records set amount = 1$$);
select test.denied('fetch_logs へクライアントから INSERT できない',
  $$insert into public.fetch_logs (user_id, status) values ('bbbbbbbb-0000-4000-8000-000000000002', 'success')$$);
select test.denied('connections をクライアントから INSERT できない',
  $$insert into public.connections (user_id, kind, provider_key, external_account_id)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'gmail', 'google', 'test-google-sub-b')$$);
select test.denied('profiles をクライアントから INSERT できない',
  $$insert into public.profiles (id) values ('bbbbbbbb-0000-4000-8000-000000000002')$$);

-- =============================================================================
\echo ''
\echo '--- 5. OAuth トークンはブラウザ用ロールから取得できない ---'
select test.denied('authenticated は private スキーマを参照できない',
  $$select * from private.oauth_credentials$$);
select test.denied('authenticated はトークン取得関数を実行できない',
  $$select * from public.oauth_credentials_get('e1111111-0000-4000-8000-000000000001')$$);
select test.denied('authenticated はトークン保存関数を実行できない',
  $$select public.oauth_credentials_upsert('e1111111-0000-4000-8000-000000000001','x',null,null,1)$$);
select test.denied('authenticated はトークン削除関数を実行できない',
  $$select public.oauth_credentials_delete('e1111111-0000-4000-8000-000000000001')$$);

reset role;
reset request.jwt.claims;

select test.ok('public.connections に access_token カラムが存在しない',
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'connections'
      and column_name like '%token%') = 0);

select test.ok('anon ロールは private スキーマへの USAGE を持たない',
  not has_schema_privilege('anon', 'private', 'usage'));
select test.ok('authenticated ロールは private スキーマへの USAGE を持たない',
  not has_schema_privilege('authenticated', 'private', 'usage'));
select test.ok('service_role は private スキーマへの USAGE を持つ',
  has_schema_privilege('service_role', 'private', 'usage'));

-- =============================================================================
\echo ''
\echo '--- 6. service_role からはトークンを扱える ---'
set role service_role;
select test.ok('service_role はトークン取得関数を実行できる',
  (select access_token_encrypted from public.oauth_credentials_get('e1111111-0000-4000-8000-000000000001'))
    = 'v1.ENCRYPTED-ACCESS-TOKEN');
select test.ok('保存されている値が暗号文である（平文らしき文字列でない）',
  (select access_token_encrypted from public.oauth_credentials_get('e1111111-0000-4000-8000-000000000001'))
    like 'v1.%');
select public.oauth_credentials_upsert(
  'e1111111-0000-4000-8000-000000000001', 'v1.NEW-ACCESS', null, now() + interval '2 hours', 1);
select test.ok('リフレッシュトークンは新しい値が無ければ保持される',
  (select refresh_token_encrypted from public.oauth_credentials_get('e1111111-0000-4000-8000-000000000001'))
    = 'v1.ENCRYPTED-REFRESH-TOKEN');
reset role;

-- =============================================================================
\echo ''
\echo '--- 7. 請求情報の重複防止（UPSERT） ---'
insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
        99999, '2026-09-27', 'gmail', 'success')
on conflict (card_id, source, payment_date) do update
  set amount = excluded.amount, fetched_at = now();
select test.ok('同一スロットの再取得で行が増えず、金額が更新される',
  (select count(*) from public.billing_records
     where card_id = 'c1111111-0000-4000-8000-000000000001') = 1
  and (select amount from public.billing_records
     where card_id = 'c1111111-0000-4000-8000-000000000001') = 99999);

insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
        12000, '2026-10-27', 'gmail', 'success');
select test.ok('支払日が違えば別の行として残る（履歴が消えない）',
  (select count(*) from public.billing_records
     where card_id = 'c1111111-0000-4000-8000-000000000001') = 2);

-- 支払日が不明な失敗行が増え続けないこと（NULLS NOT DISTINCT の確認）
insert into public.billing_records (user_id, card_id, payment_date, source, status, error_code)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
        null, 'gmail', 'error', 'mail_not_found');
select test.denied('支払日 NULL の行は同一スロットとして重複できない',
  $$insert into public.billing_records (user_id, card_id, payment_date, source, status, error_code)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
            null, 'gmail', 'error', 'timeout')$$);

-- =============================================================================
\echo ''
\echo '--- 8. 制約（金額・状態・カード情報） ---'
select test.denied('status=success で金額 NULL は保存できない',
  $$insert into public.billing_records (user_id, card_id, payment_date, source, status)
    values ('aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',
            '2026-11-27','api','success')$$);
select test.denied('status=error で error_code なしは保存できない',
  $$insert into public.billing_records (user_id, card_id, payment_date, source, status)
    values ('aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',
            '2026-11-27','api','error')$$);
select test.denied('負の金額は保存できない',
  $$insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
    values ('aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',
            -1,'2026-11-27','api','success')$$);
select test.denied('source は api / gmail 以外を受け付けない',
  $$insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
    values ('aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',
            1,'2026-11-27','scraping','success')$$);

insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
values ('aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',
        0,'2026-12-27','api','success');
select test.ok('0 円は確定値として保存できる（未取得の NULL と区別される）',
  (select amount from public.billing_records
     where card_id='c1111111-0000-4000-8000-000000000001' and payment_date='2026-12-27') = 0);

select test.denied('last_four にカード番号全桁は保存できない',
  $$insert into public.cards (user_id, provider_key, display_name, last_four)
    values ('aaaaaaaa-0000-4000-8000-000000000001','test','X','4111111111111111')$$);
select test.denied('last_four に 4 桁以外は保存できない',
  $$insert into public.cards (user_id, provider_key, display_name, last_four)
    values ('aaaaaaaa-0000-4000-8000-000000000001','test','X','12a4')$$);
select test.denied('payment_day は 1-31 の範囲外を受け付けない',
  $$insert into public.cards (user_id, provider_key, display_name, payment_day)
    values ('aaaaaaaa-0000-4000-8000-000000000001','test','X',32)$$);
select test.denied('preferred_source は api / gmail 以外を受け付けない',
  $$insert into public.cards (user_id, provider_key, display_name, preferred_source)
    values ('aaaaaaaa-0000-4000-8000-000000000001','test','X','manual')$$);
select test.denied('fetch_logs の message は 200 文字を超えられない',
  $$insert into public.fetch_logs (user_id, status, message)
    values ('aaaaaaaa-0000-4000-8000-000000000001','success', repeat('あ', 201))$$);

-- provider_key は DB の enum ではないため、新しいカード会社を追加できる
insert into public.cards (user_id, provider_key, display_name)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'jcb', 'JCBカード');
select test.ok('新しい provider_key をマイグレーションなしで追加できる',
  (select count(*) from public.cards where provider_key = 'jcb') = 1);

-- =============================================================================
\echo ''
\echo '--- 9. updated_at の自動更新 ---'
do $$
declare before_ts timestamptz; after_ts timestamptz;
begin
  select updated_at into before_ts from public.cards where provider_key = 'jcb';
  perform pg_sleep(0.01);
  update public.cards set display_name = 'JCB' where provider_key = 'jcb';
  select updated_at into after_ts from public.cards where provider_key = 'jcb';
  perform test.ok('cards.updated_at が UPDATE 時に自動更新される', after_ts > before_ts);
end $$;

-- =============================================================================
\echo ''
\echo '--- 10. カード削除時の関連データ ---'
insert into public.cards (id, user_id, provider_key, display_name)
values ('c3333333-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001','paypay','PayPayカード');
insert into public.billing_records (user_id, card_id, amount, payment_date, source, status)
values ('aaaaaaaa-0000-4000-8000-000000000001','c3333333-0000-4000-8000-000000000003',
        38500,'2026-09-27','gmail','success');
delete from public.cards where id = 'c3333333-0000-4000-8000-000000000003';
select test.ok('カード削除時に請求情報も削除される（残骸を残さない）',
  (select count(*) from public.billing_records
     where card_id = 'c3333333-0000-4000-8000-000000000003') = 0);

-- =============================================================================
\echo ''
\echo '--- 11. スキーマ全体のセキュリティ確認 ---'
select test.ok('public の全テーブルで RLS が有効',
  (select count(*) from pg_tables t
     where t.schemaname = 'public' and not exists (
       select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity)) = 0);

select test.ok('private.oauth_credentials で RLS が有効',
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'oauth_credentials'));

select test.ok('カード番号全桁・CVV・パスワードらしきカラムが存在しない',
  (select count(*) from information_schema.columns
     where table_schema in ('public','private')
       and (column_name ~* '(card_number|pan|cvv|cvc|security_code|password|passwd|secret_answer)')) = 0);

select test.ok('anon ロールはどのテーブルにも権限を持たない',
  (select count(*) from information_schema.role_table_grants
     where grantee = 'anon' and table_schema in ('public','private')) = 0);

select test.ok('authenticated は billing_records へ SELECT のみ',
  (select array_agg(distinct privilege_type::text order by privilege_type::text)
     from information_schema.role_table_grants
    where grantee = 'authenticated' and table_name = 'billing_records') = array['SELECT']);

select test.ok('authenticated は connections へ SELECT のみ',
  (select array_agg(distinct privilege_type::text order by privilege_type::text)
     from information_schema.role_table_grants
    where grantee = 'authenticated' and table_name = 'connections') = array['SELECT']);

\echo ''
\o
\echo '==== すべての検証に合格しました ===='
