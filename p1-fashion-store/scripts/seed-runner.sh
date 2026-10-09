#!/usr/bin/env bash
# Dev helper: run seed.sh detached with a log (idempotency proof run).
cd "$(dirname "$0")/.."
bash scripts/seed.sh > seed-run.log 2>&1
echo "SEED_MARKER_DONE=$?" >> seed-run.log
