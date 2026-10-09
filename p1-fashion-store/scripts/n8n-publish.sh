#!/usr/bin/env sh
# n8n-publish.sh — publish every workflow stored in the local n8n volume.
#
# Why this exists: n8n 2.x refuses to attach an error workflow ("The selected
# error workflow has no published version") and refuses to activate a draft, so
# every freshly imported workflow must be published once. `publish:workflow
# --all` was removed in 2.x, so we loop over the ids from `list:workflow`.
#
# Run it with the n8n server STOPPED (a running server holds the SQLite lock):
#   docker stop nilad-n8n
#   docker run --rm -v nilad-n8n-data:/home/node/.n8n -v "$PWD/scripts:/scripts:ro" \
#     --entrypoint sh n8nio/n8n:latest /scripts/n8n-publish.sh
#   docker start nilad-n8n
set -eu

n8n list:workflow | while IFS='|' read -r id name; do
  [ -z "${id:-}" ] && continue
  printf '%s [%s] -> ' "${name}" "${id}"
  n8n publish:workflow --id="$id" 2>&1 | tail -1
done
