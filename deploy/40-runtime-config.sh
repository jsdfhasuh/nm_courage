#!/bin/sh
set -eu

# Positional paths support local tests. The image entrypoint uses these fixed defaults.
output=${1:-/tmp/nm-courage/runtime-config.json}
filter=${2:-/usr/local/share/nm-courage/runtime-config.jq}
umask 022
mkdir -p "$(dirname "$output")"
temporary=$(mktemp "${output}.tmp.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM

# Deliberate whitelist: never serialize the full environment or substitute raw JS.
if ! jq -n \
  --arg salaryType "${NM_SALARY_TYPE:-}" \
  --arg salary "${NM_SALARY:-}" \
  --arg start "${NM_WORK_START:-}" \
  --arg end "${NM_WORK_END:-}" \
  --arg breakEnabled "${NM_BREAK_ENABLED:-}" \
  --arg breakStart "${NM_BREAK_START:-}" \
  --arg breakEnd "${NM_BREAK_END:-}" \
  --arg workdays "${NM_WORKDAYS:-}" \
  --arg goalName "${NM_GOAL_NAME:-}" \
  --arg goalPrice "${NM_GOAL_PRICE:-}" \
  -f "$filter" > "$temporary"; then
  echo 'nm_courage: invalid runtime defaults; startup stopped. Values are not logged.' >&2
  exit 1
fi
chmod 644 "$temporary"
mv -f "$temporary" "$output"
