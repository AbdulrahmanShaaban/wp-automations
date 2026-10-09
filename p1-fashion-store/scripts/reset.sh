#!/usr/bin/env bash
# reset.sh — rebuild the local site from zero: destroy → start → activate → seed → verify.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Patching wp-env for usernames with spaces (idempotent)"
node scripts/patch-wp-env.js

echo "==> Destroying previous environment (if any)"
npx @wordpress/env destroy --force || true

echo "==> Starting fresh environment"
npx @wordpress/env start

echo "==> Activating theme + plugin"
npx @wordpress/env run cli wp theme activate nilad-theme
npx @wordpress/env run cli wp plugin activate nilad-core

echo "==> Seeding"
bash scripts/seed.sh

echo "==> Verifying"
bash scripts/verify.sh

echo "==> reset.sh OK — site rebuilt from zero and verified."
