#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pg_ctl -D .local/postgres stop
