#!/usr/bin/env bash
set -euo pipefail

image=${1:?Usage: smoke-test-image.sh IMAGE ARCH}
arch=${2:?Usage: smoke-test-image.sh IMAGE ARCH}
container=""
tmpdir=$(mktemp -d)

cleanup() {
  status=$?
  if [[ -n "$container" ]]; then
    if [[ "$status" -ne 0 ]]; then
      docker logs "$container" || true
      docker inspect "$container" || true
    fi
    docker rm -f "$container" >/dev/null || true
  fi
  rm -rf "$tmpdir"
  exit "$status"
}
trap cleanup EXIT

test "$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')" = "linux/${arch}"
docker run --rm "$image" nginx -t
container=$(docker run -d -p 127.0.0.1::8080 "$image")
address=$(docker port "$container" 8080/tcp)
base="http://${address}"

curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 1 \
  --connect-timeout 2 --max-time 5 --dump-header "$tmpdir/headers" \
  --output "$tmpdir/index.html" "${base}/"
grep -q '牛马鼓励器' "$tmpdir/index.html"
grep -Eiq '^content-type: text/html' "$tmpdir/headers"
grep -Eiq '^x-content-type-options: nosniff' "$tmpdir/headers"

for module in app chase donkey-scene motion scene-player time; do
  curl --fail --silent --show-error --max-time 5 --dump-header "$tmpdir/headers" \
    --output "$tmpdir/${module}.mjs" "${base}/${module}.mjs"
  grep -Eiq '^content-type: application/javascript' "$tmpdir/headers"
  test -s "$tmpdir/${module}.mjs"
done
curl --fail --silent --show-error --max-time 5 --output /dev/null "${base}/style.css"
curl --fail --silent --show-error --max-time 5 --output /dev/null "${base}/carrot.svg"
test "$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' "${base}/missing-module.mjs")" = '404'

for attempt in {1..45}; do
  health=$(docker inspect "$container" --format '{{.State.Health.Status}}')
  if [[ "$health" == 'healthy' ]]; then
    echo "HTTP, module MIME, missing-file handling and healthcheck passed for linux/${arch}."
    exit 0
  fi
  if [[ "$health" == 'unhealthy' ]]; then
    echo 'Container healthcheck failed.' >&2
    exit 1
  fi
  sleep 2
done
echo 'Timed out waiting for container healthcheck.' >&2
exit 1
