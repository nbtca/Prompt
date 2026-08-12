#!/usr/bin/env bash
set -euo pipefail

cli_test_root="$(mktemp -d)"
trap 'rm -rf "$cli_test_root"' EXIT
export XDG_CONFIG_HOME="$cli_test_root/config"

assert_fails_with() {
  local label="$1"
  local expected="$2"
  shift 2
  local stderr_file="$cli_test_root/$label.stderr"

  if "$@" > /dev/null 2>"$stderr_file"; then
    echo "$label unexpectedly succeeded" >&2
    exit 1
  fi
  if ! grep -Fq -- "$expected" "$stderr_file"; then
    echo "$label returned the wrong error" >&2
    exit 1
  fi
}

node dist/index.js lang en > /dev/null

version_output="$(node dist/index.js --version)"
if [[ ! "$version_output" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "version output not semver: $version_output" >&2
  exit 1
fi
if [[ "$(node dist/index.js -v)" != "$version_output" ]]; then
  echo "-v output mismatch" >&2
  exit 1
fi

help_output="$(node dist/index.js --help)"
if [[ "$help_output" != *"Usage:"* || "$help_output" != *"--heatmap"* ]]; then
  echo "help output is incomplete" >&2
  exit 1
fi

plain_output_file="$cli_test_root/plain.out"
plain_stderr_file="$cli_test_root/plain.stderr"
NO_COLOR=1 FORCE_COLOR=3 node dist/index.js about --plain \
  > "$plain_output_file" 2> "$plain_stderr_file"
if [[ -s "$plain_stderr_file" ]] || LC_ALL=C grep -q $'\033' "$plain_output_file"; then
  echo "plain mode emitted color or a color-environment warning" >&2
  exit 1
fi

if [[ "$(node dist/index.js roadmap)" != "https://github.com/orgs/nbtca/projects/5" ]]; then
  echo "roadmap output mismatch" >&2
  exit 1
fi
if [[ "$(node dist/index.js docs)" != "https://docs.nbtca.space" ]]; then
  echo "docs output mismatch" >&2
  exit 1
fi

node dist/index.js theme icon ascii > /dev/null
if ! grep -Fq '"iconMode": "ascii"' "$cli_test_root/config/nbtca/preferences.json"; then
  echo "theme preference was not persisted" >&2
  exit 1
fi

assert_fails_with unknown-flag 'Unknown flag: --oops' node dist/index.js roadmap --oops
assert_fails_with status-conflict '--watch' node dist/index.js status --watch --json
assert_fails_with status-interval '--interval' node dist/index.js status --interval=8
assert_fails_with status-interval-bounds '--interval=<' node dist/index.js status --watch --interval=1
assert_fails_with status-timeout-bounds '--timeout=<' node dist/index.js status --timeout=500
assert_fails_with status-retries-bounds '--retries=<' node dist/index.js status --retries=9
assert_fails_with events-next-format '--next=<number>' node dist/index.js events --next=1x
assert_fails_with status-interval-format '--interval=<' node dist/index.js status --watch --interval=3.5
assert_fails_with status-timeout-format '--timeout=<' node dist/index.js status --timeout=1000ms
assert_fails_with status-retries-format '--retries=<' node dist/index.js status --retries=1x
assert_fails_with events-arguments 'Unexpected arguments for events.' node dist/index.js events extra
assert_fails_with status-arguments 'Unexpected arguments for status.' node dist/index.js status extra
assert_fails_with docs-arguments 'Unexpected arguments for docs.' node dist/index.js docs extra
assert_fails_with url-arguments 'Unexpected arguments for roadmap.' node dist/index.js roadmap extra
assert_fails_with lang-arguments 'Unexpected arguments for lang.' node dist/index.js lang en extra
assert_fails_with theme-arguments 'Unexpected arguments for theme.' node dist/index.js theme reset extra
assert_fails_with update-arguments 'Unexpected arguments for update.' node dist/index.js update extra
assert_fails_with version-arguments 'Unexpected arguments for version.' node dist/index.js version extra
assert_fails_with help-arguments 'Unexpected arguments for help.' node dist/index.js help extra

all_down_import='--import=data:text/javascript,globalThis.fetch=async()=>new%20Response(null,{status:503})'
status_json_file="$cli_test_root/status.json"
if NODE_OPTIONS="$all_down_import" node dist/index.js status --json --timeout=1000 --retries=0 \
  > "$status_json_file" 2> "$cli_test_root/status-json.stderr"; then
  echo "status JSON unexpectedly succeeded when public services failed" >&2
  exit 1
fi
node -e '
  const fs = require("node:fs");
  const statuses = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(statuses) || statuses.length === 0 || statuses.some((item) => item.ok)) {
    process.exit(1);
  }
' "$status_json_file"

intranet_down_import="--import=data:text/javascript,globalThis.fetch=async(input)=>new%20Response(null,{status:['cloud.nbtca.space','i.nbtca.space'].includes(new%20URL(String(input)).hostname)?503:200})"
intranet_output="$(NODE_OPTIONS="$intranet_down_import" node dist/index.js status --plain --timeout=1000 --retries=0)"
if [[ "$intranet_output" != *"Public services are healthy; intranet availability depends on your network"* ]]; then
  echo "intranet-only failure returned the wrong summary" >&2
  exit 1
fi
assert_fails_with non-tty 'Interactive mode requires a TTY terminal' node dist/index.js

echo "CLI contract tests passed."
