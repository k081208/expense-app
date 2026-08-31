#!/usr/bin/env bash
# ローカル PostgreSQL 上でマイグレーションを適用し、RLS とセキュリティ要件を検証する。
#   使い方: PGDATABASE=card_billing_test ./supabase/tests/run.sh
set -euo pipefail

DB="${PGDATABASE:-card_billing_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"

psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists ${DB};"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database ${DB};"

echo "== ブートストラップ（Supabase 相当のロール・auth スキーマ） =="
psql -v ON_ERROR_STOP=1 -q -d "${DB}" -f "${HERE}/00_local_bootstrap.sql"

echo "== マイグレーション適用 =="
for f in "${ROOT}"/migrations/*.sql; do
  echo "   -> $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "${DB}" -f "$f"
done

echo "== 検証 =="
psql -v ON_ERROR_STOP=1 -q -d "${DB}" -f "${HERE}/10_security_test.sql"
psql -v ON_ERROR_STOP=1 -q -d "${DB}" -f "${HERE}/20_connections_test.sql"
