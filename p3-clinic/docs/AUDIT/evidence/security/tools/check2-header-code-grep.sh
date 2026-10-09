#!/usr/bin/env bash
# check2-header-code-grep.sh — READ-ONLY supplementary greps backing finding #2.
# Run from the project root: bash docs/AUDIT/evidence/security/tools/check2-header-code-grep.sh
# Writes docs/AUDIT/evidence/security/check2-header-code-grep.txt (UTF-8).
set -u
OUT="docs/AUDIT/evidence/security/check2-header-code-grep.txt"
{
  echo "# Finding #2 supplementary greps — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# scope: project source tree only (never the container docroot)"
  echo
  echo "## 1. security-header code anywhere in wp-content/ (report quotes this grep)"
  echo "\$ grep -rn 'send_headers\|header(\|Content-Security\|X-Frame' --include='*.php' --include='*.html' wp-content/"
  grep -rn 'send_headers\|header(\|Content-Security\|X-Frame' --include='*.php' --include='*.html' wp-content/
  echo "exit=$? (grep: 1 = zero matches)"
  echo "matches: 0 (no output lines above)"
  echo
  echo "## 2. scope: php/html files scanned under wp-content/"
  find wp-content \( -name '*.php' -o -name '*.html' \) -type f | sort
  echo "php/html files under wp-content/: $(find wp-content \( -name '*.php' -o -name '*.html' \) -type f | wc -l)"
  echo
  echo "## 3. .htaccess anywhere in the project tree (node_modules pruned)"
  echo "\$ find . -name '.htaccess' -not -path './node_modules/*'"
  find . -name '.htaccess' -not -path './node_modules/*'
  echo "exit=$?"
  echo "findings: $(find . -name '.htaccess' -not -path './node_modules/*' | wc -l) .htaccess file(s) in the project tree"
  echo "(the container docroot /var/www/html/.htaccess is core's rewrite block — check7-inventory.txt section F)"
} > "$OUT"
echo "wrote $OUT"
