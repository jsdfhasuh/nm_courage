#!/usr/bin/env bash
set -euo pipefail
image=${1:?Usage: smoke-test-runtime-config.sh IMAGE}
containers=()
tmpdir=$(mktemp -d)
cleanup() {
  status=$?
  for container in "${containers[@]}"; do
    if [[ "$status" -ne 0 ]]; then docker logs "$container" || true; fi
    docker rm -f "$container" >/dev/null || true
  done
  rm -rf "$tmpdir"
  exit "$status"
}
trap cleanup EXIT
start() {
  container=$(docker run -d -p 127.0.0.1::8080 "$@" "$image")
  containers+=("$container")
  address=$(docker port "$container" 8080/tcp)
  base="http://${address}"
  curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 1 \
    --connect-timeout 2 --max-time 5 --dump-header "$tmpdir/headers" \
    --output "$tmpdir/config.json" "${base}/runtime-config.json"
  grep -Eiq '^content-type: application/json' "$tmpdir/headers"
  grep -Eiq '^cache-control: no-store' "$tmpdir/headers"
  grep -Eiq '^x-content-type-options: nosniff' "$tmpdir/headers"
  curl --fail --silent --show-error --max-time 5 --output /dev/null "${base}/"
}
image_id=$(docker image inspect "$image" --format '{{.Id}}')
start
jq -e '. == {}' "$tmpdir/config.json"

goal='</script><img src=x>'
start -e NM_SALARY=15000 -e NM_WORK_START=22:00 -e NM_WORK_END=06:00 \
  -e NM_BREAK_ENABLED=true -e NM_BREAK_START=01:00 -e NM_BREAK_END=01:30 \
  -e NM_WORKDAYS=0,1,1,6 -e "NM_GOAL_NAME=$goal" -e NM_GOAL_PRICE=31.50 \
  -e UNRELATED_SECRET=never-expose-this-test-value
jq -e --arg goal "$goal" '.settings == {salary:15000,start:"22:00",end:"06:00",breakEnabled:true,breakStart:"01:00",breakEnd:"01:30",workdays:[0,1,6]} and .goal == {name:$goal,price:31.5}' "$tmpdir/config.json"
! grep -q 'never-expose-this-test-value\|UNRELATED_SECRET' "$tmpdir/config.json"

# Reuse the exact same image with different defaults on a read-only root and arbitrary UID.
start --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m,mode=1777 --user 10001:10001 \
  -e NM_SALARY=17000 -e NM_BREAK_ENABLED=false -e NM_WORKDAYS=0
jq -e '.settings == {salary:17000,breakEnabled:false,workdays:[0]}' "$tmpdir/config.json"
test "$(docker image inspect "$image" --format '{{.Id}}')" = "$image_id"
for attempt in {1..45}; do
  health=$(docker inspect "$container" --format '{{.State.Health.Status}}')
  if [[ "$health" == healthy ]]; then break; fi
  if [[ "$health" == unhealthy ]]; then exit 1; fi
  sleep 2
done
test "$health" = healthy

invalid_name="nm-runtime-invalid-${RANDOM}"
containers+=("$invalid_name")
set +e
timeout 15s docker run --name "$invalid_name" -e NM_SALARY=0 "$image" > "$tmpdir/invalid.log" 2>&1
invalid_status=$?
set -e
test "$invalid_status" -eq 1
grep -q 'Invalid NM_SALARY' "$tmpdir/invalid.log"
test "$(docker inspect "$invalid_name" --format '{{.State.Running}}')" = false
echo 'Runtime defaults, safe JSON, whitelist, invalid values, same-image reconfiguration and read-only arbitrary-UID healthcheck passed.'
