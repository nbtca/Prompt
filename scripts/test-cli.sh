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
assert_fails_with non-tty 'Interactive mode requires a TTY terminal' node dist/index.js

echo "CLI contract tests passed."
