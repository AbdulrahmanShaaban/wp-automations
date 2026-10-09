#!/usr/bin/env bash
# Reset OPcache in the running Apache SAPI (validate_timestamps=0 => PHP edits
# are invisible until this runs). Safe to call any time.
set -euo pipefail
cd "$(dirname "$0")/.."
F='wp-content/plugins/nilad-core/.opcache-reset.php'
printf '%s' '<?php header("Content-Type: text/plain"); echo function_exists("opcache_reset") ? (opcache_reset() ? "reset-ok" : "reset-failed") : "no-opcache";' > "$F"
curl -fsS "http://localhost:8888/wp-content/plugins/nilad-core/.opcache-reset.php"
echo
rm -f "$F"
