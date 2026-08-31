-- =============================================================================
-- 複数 Gmail アカウント対応の検証
--
-- 10_security_test.sql の続きとして実行する（同じデータベース・同じテスト関数を使う）。
-- ここで使う external_account_id はすべてテスト用の架空の値。
-- 実際のメールアドレスや Google の sub は使わない。
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages to notice;
\o /dev/null

\echo ''
\echo '--- 12. 同じ利用者が Gmail 連携を 2 件持てる ---'

-- ユーザー A の 2 つ目の Gmail 連携（1 つ目は 10_security_test.sql で作成済み）
insert into public.connections (id, user_id, kind, provider_key, external_account_id, account_email, scopes)
values ('e1111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
        'gmail', 'google', 'test-google-sub-a2', 'test-account-2@example.test',
        array['https://www.googleapis.com/auth/gmail.readonly']);

select test.ok('同じ利用者が Gmail 連携を 2 件登録できる',
  (select count(*) from public.connections
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind = 'gmail') = 2);

select test.denied('同じ連携先アカウントを二重登録できない',
  $$insert into public.connections (user_id, kind, provider_key, external_account_id)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'gmail', 'google', 'test-google-sub-a2')$$);

select test.denied('Gmail 連携は連携先アカウントの ID なしでは作れない',
  $$insert into public.connections (user_id, kind, provider_key)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'gmail', 'google')$$);

-- 別の利用者が同じ Google アカウントを連携することは妨げない（個人利用のため）
insert into public.connections (id, user_id, kind, provider_key, external_account_id)
values ('e2222222-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002',
        'gmail', 'google', 'test-google-sub-a2');
select test.ok('別の利用者は同じ連携先アカウントを登録できる（全体で一意にしない）',
  (select count(*) from public.connections where external_account_id = 'test-google-sub-a2') = 2);

-- API 連携（構造の確認用。実装は STEP 9）
insert into public.connections (id, user_id, kind, provider_key, status)
values ('e1111111-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001',
        'api', 'rakuten', 'connected');
select test.ok('API 連携は連携先アカウントの ID が無くても作れる',
  (select count(*) from public.connections
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind = 'api') = 1);

select test.ok('連携の種別は gmail / api のみ',
  (select count(*) from public.connections where kind not in ('gmail','api')) = 0);
select test.denied('種別に想定外の値は入れられない',
  $$insert into public.connections (user_id, kind, provider_key, external_account_id)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'google', 'google', 'x')$$);

\echo ''
\echo '--- 13. カードと連携の割り当て ---'

-- 10_security_test.sql で作成済みのカード（A: c1111111... / B: c2222222...）を使う
insert into public.card_connection_assignments (user_id, card_id, connection_id, source)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
        'e1111111-0000-4000-8000-000000000001', 'gmail');
select test.ok('自分のカードへ自分の Gmail 連携を割り当てられる',
  (select count(*) from public.card_connection_assignments
    where card_id = 'c1111111-0000-4000-8000-000000000001') = 1);

select test.denied('同じカードへ 2 つ目の Gmail 連携は割り当てられない',
  $$insert into public.card_connection_assignments (user_id, card_id, connection_id, source)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
            'e1111111-0000-4000-8000-000000000002', 'gmail')$$);

-- 取得元を切り替える（更新なら通る）
update public.card_connection_assignments
   set connection_id = 'e1111111-0000-4000-8000-000000000002'
 where card_id = 'c1111111-0000-4000-8000-000000000001' and source = 'gmail';
select test.ok('割り当ての付け替えは更新として行える',
  (select connection_id from public.card_connection_assignments
    where card_id = 'c1111111-0000-4000-8000-000000000001' and source = 'gmail')
  = 'e1111111-0000-4000-8000-000000000002');

-- Gmail と API は共存できる
insert into public.card_connection_assignments (user_id, card_id, connection_id, source)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
        'e1111111-0000-4000-8000-0000000000a1', 'api');
select test.ok('同じカードに Gmail と API を同時に割り当てられる',
  (select count(*) from public.card_connection_assignments
    where card_id = 'c1111111-0000-4000-8000-000000000001') = 2);

select test.denied('Gmail 連携を api として割り当てられない（種別が一致しない）',
  $$insert into public.card_connection_assignments (user_id, card_id, connection_id, source)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'c2222222-0000-4000-8000-000000000002',
            'e1111111-0000-4000-8000-000000000001', 'api')$$);

select test.ok('割り当てが無いカードがあってもよい（未設定は正常）',
  (select count(*) from public.cards c
    where not exists (select 1 from public.card_connection_assignments a
                       where a.card_id = c.id)) > 0);

\echo ''
\echo '--- 14. 所有者の一致を DB で保証する ---'

select test.denied('他人のカードへ自分の連携を割り当てられない',
  $$insert into public.card_connection_assignments (user_id, card_id, connection_id, source)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'c1111111-0000-4000-8000-000000000001',
            'e2222222-0000-4000-8000-000000000001', 'gmail')$$);

select test.denied('自分のカードへ他人の連携を割り当てられない',
  $$insert into public.card_connection_assignments (user_id, card_id, connection_id, source)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'c2222222-0000-4000-8000-000000000002',
            'e1111111-0000-4000-8000-000000000001', 'gmail')$$);

select test.denied('所有者の異なるカードと連携を組み合わせられない',
  $$insert into public.card_connection_assignments (user_id, card_id, connection_id, source)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'c2222222-0000-4000-8000-000000000002',
            'e1111111-0000-4000-8000-000000000001', 'gmail')$$);

\echo ''
\echo '--- 15. RLS（ユーザー B から見た場合） ---'
set role authenticated;
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

select test.ok('B: A の連携は見えない',
  (select count(*) from public.connections
    where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0);
select test.ok('B: 自分の連携は見える',
  (select count(*) from public.connections) = 1);
select test.ok('B: A の割り当ては見えない',
  (select count(*) from public.card_connection_assignments) = 0);

select test.denied('B: A の user_id で割り当てを作成できない',
  $$insert into public.card_connection_assignments (user_id, card_id, connection_id, source)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
            'e1111111-0000-4000-8000-000000000002', 'gmail')$$);

update public.card_connection_assignments set enabled = false;
reset role;
select test.ok('B: A の割り当てを更新できない',
  (select count(*) from public.card_connection_assignments where enabled = false) = 0);

set role authenticated;
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
delete from public.card_connection_assignments;
reset role;
select test.ok('B: A の割り当てを削除できない',
  (select count(*) from public.card_connection_assignments) = 2);

\echo ''
\echo '--- 16. ユーザー A 自身の操作 ---'
set role authenticated;
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
select test.ok('A: 自分の連携を参照できる', (select count(*) from public.connections) = 3);
select test.ok('A: 自分の割り当てを参照できる',
  (select count(*) from public.card_connection_assignments) = 2);
select test.ok('A: 表示用のメールアドレスを参照できる',
  (select account_email from public.connections
    where id = 'e1111111-0000-4000-8000-000000000002') = 'test-account-2@example.test');
select test.denied('A: 連携そのものはクライアントから作成できない（サーバー処理のみ）',
  $$insert into public.connections (user_id, kind, provider_key, external_account_id)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'gmail', 'google', 'test-google-sub-a3')$$);
reset role;

\echo ''
\echo '--- 17. 秘密情報の保護（STEP 2 から変更していないこと） ---'
select test.ok('public.connections にトークンのカラムが増えていない',
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'connections'
      and column_name like '%token%') = 0);
select test.ok('割り当てテーブルにもトークンのカラムが無い',
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'card_connection_assignments'
      and column_name ~* '(token|secret|password)') = 0);
select test.ok('private.oauth_credentials は authenticated から参照できない',
  not has_table_privilege('authenticated', 'private.oauth_credentials', 'select'));
select test.ok('トークン取得関数は service_role のみ実行できる',
  not has_function_privilege('authenticated', 'public.oauth_credentials_get(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.oauth_credentials_get(uuid)', 'execute'));

\echo ''
\echo '--- 18. 連携解除時の扱い ---'
-- 推奨する運用: 行は消さず status を revoked にし、トークンだけを削除する
select public.oauth_credentials_delete('e1111111-0000-4000-8000-000000000001');
update public.connections set status = 'revoked'
 where id = 'e1111111-0000-4000-8000-000000000001';
select test.ok('連携解除しても割り当ては残る（再接続でそのまま使える）',
  (select count(*) from public.card_connection_assignments) = 2);
select test.ok('連携解除してもカードは消えない',
  (select count(*) from public.cards
    where id = 'c1111111-0000-4000-8000-000000000001') = 1);
select test.ok('連携解除でトークンだけが削除される',
  (select count(*) from private.oauth_credentials
    where connection_id = 'e1111111-0000-4000-8000-000000000001') = 0);

-- 連携の行そのものを削除した場合は、割り当ても一緒に消える（宙に浮いた行を残さない）
delete from public.connections where id = 'e1111111-0000-4000-8000-000000000002';
select test.ok('連携を削除すると、その割り当ても消える',
  (select count(*) from public.card_connection_assignments where source = 'gmail') = 0);
select test.ok('連携を削除してもカードは消えない',
  (select count(*) from public.cards
    where id = 'c1111111-0000-4000-8000-000000000001') = 1);

\echo ''
\echo '--- 19. billing_records を変更していないこと ---'
select test.ok('billing_records の一意制約が変わっていない',
  (select count(*) from pg_constraint
    where conname = 'billing_records_slot_key') = 1);
select test.ok('billing_records に連携の列が増えていない',
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'billing_records'
      and column_name ~* 'connection') = 0);

\o
\echo ''
\echo '==== 複数 Gmail アカウント対応の検証に合格しました ===='
