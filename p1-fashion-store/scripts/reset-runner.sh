#!/usr/bin/env bash
# Dev helper: run reset.sh detached with a log file (used when the shell tool
# would time out). Safe to delete; reset.sh itself is the real entry point.
cd "$(dirname "$0")/.."
bash scripts/reset.sh > reset-run.log 2>&1
echo "RESET_MARKER_DONE=$?" >> reset-run.log
