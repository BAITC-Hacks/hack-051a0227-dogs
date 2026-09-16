#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local/postgres .local/socket
if [ ! -f .local/postgres/PG_VERSION ]; then
  initdb -D .local/postgres -U leader -A trust --encoding=UTF8 --locale=C >/dev/null
fi
if ! pg_ctl -D .local/postgres status >/dev/null 2>&1; then
  pg_ctl -D .local/postgres -l .local/postgres.log -o "-p 55439 -h 127.0.0.1 -k $PWD/.local/socket" start
fi
if ! psql -h 127.0.0.1 -p 55439 -U leader -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='leader_id'" | rg -q 1; then
  createdb -h 127.0.0.1 -p 55439 -U leader leader_id
fi
if [ ! -f .env ]; then cp .env.example .env; fi
