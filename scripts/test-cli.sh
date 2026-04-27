#!/usr/bin/env bash
set -euo pipefail

version_output="$(node dist/index.js --version)"
if [[ ! "$version_output" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "version output not semver: $version_output" >&2
  exit 1
fi

version_v_output="$(node dist/index.js -v)"
if [[ "$version_v_output" != "$version_output" ]]; then
  echo "-v output mismatch: $version_v_output vs $version_output" >&2
  exit 1
fi

help_output="$(node dist/index.js --help)"
if [[ "$help_output" != *"Usage:"* ]]; then
  echo "help output missing Usage section" >&2
  exit 1
fi

roadmap_output="$(node dist/index.js roadmap)"
if [[ "$roadmap_output" != "https://github.com/orgs/nbtca/projects/5" ]]; then
  echo "roadmap output mismatch: $roadmap_output" >&2
  exit 1
fi

docs_output="$(node dist/index.js docs)"
if [[ "$docs_output" != "https://docs.nbtca.space" ]]; then
  echo "docs output mismatch: $docs_output" >&2
  exit 1
fi

tmp_home="$(mktemp -d)"
trap 'rm -rf "$tmp_home"' EXIT
HOME="$tmp_home" XDG_CONFIG_HOME="$tmp_home/.config" node dist/index.js theme icon ascii >/dev/null
if ! grep -q '"iconMode": "ascii"' "$tmp_home/.config/nbtca/preferences.json"; then
  echo "theme preference was not persisted" >&2
  rm -rf "$tmp_home"
  exit 1
fi
rm -rf "$tmp_home"

unknown_flag_stderr="$(mktemp)"
if node dist/index.js roadmap --oops >/dev/null 2>"$unknown_flag_stderr"; then
  echo "expected unknown flag to fail" >&2
  rm -f "$unknown_flag_stderr"
  exit 1
fi
if ! grep -q "Unknown flag: --oops" "$unknown_flag_stderr"; then
  echo "unknown flag error message mismatch" >&2
  rm -f "$unknown_flag_stderr"
  exit 1
fi
rm -f "$unknown_flag_stderr"

status_conflict_stderr="$(mktemp)"
if node dist/index.js status --watch --json >/dev/null 2>"$status_conflict_stderr"; then
  echo "expected status --watch --json to fail" >&2
  rm -f "$status_conflict_stderr"
  exit 1
fi
if ! grep -q -- "--watch" "$status_conflict_stderr"; then
  echo "status watch/json conflict message mismatch" >&2
  rm -f "$status_conflict_stderr"
  exit 1
fi
rm -f "$status_conflict_stderr"

status_interval_stderr="$(mktemp)"
if node dist/index.js status --interval=8 >/dev/null 2>"$status_interval_stderr"; then
  echo "expected status --interval without --watch to fail" >&2
  rm -f "$status_interval_stderr"
  exit 1
fi
if ! grep -q -- "--interval" "$status_interval_stderr"; then
  echo "status interval validation message mismatch" >&2
  rm -f "$status_interval_stderr"
  exit 1
fi
rm -f "$status_interval_stderr"

status_interval_bounds_stderr="$(mktemp)"
if node dist/index.js status --watch --interval=1 >/dev/null 2>"$status_interval_bounds_stderr"; then
  echo "expected status --watch --interval=1 to fail" >&2
  rm -f "$status_interval_bounds_stderr"
  exit 1
fi
if ! grep -q -- "--interval=<" "$status_interval_bounds_stderr"; then
  echo "status interval bounds message mismatch" >&2
  rm -f "$status_interval_bounds_stderr"
  exit 1
fi
rm -f "$status_interval_bounds_stderr"

status_timeout_bounds_stderr="$(mktemp)"
if node dist/index.js status --timeout=500 >/dev/null 2>"$status_timeout_bounds_stderr"; then
  echo "expected status --timeout=500 to fail" >&2
  rm -f "$status_timeout_bounds_stderr"
  exit 1
fi
if ! grep -q -- "--timeout=<" "$status_timeout_bounds_stderr"; then
  echo "status timeout bounds message mismatch" >&2
  rm -f "$status_timeout_bounds_stderr"
  exit 1
fi
rm -f "$status_timeout_bounds_stderr"

status_retries_bounds_stderr="$(mktemp)"
if node dist/index.js status --retries=9 >/dev/null 2>"$status_retries_bounds_stderr"; then
  echo "expected status --retries=9 to fail" >&2
  rm -f "$status_retries_bounds_stderr"
  exit 1
fi
if ! grep -q -- "--retries=<" "$status_retries_bounds_stderr"; then
  echo "status retries bounds message mismatch" >&2
  rm -f "$status_retries_bounds_stderr"
  exit 1
fi
rm -f "$status_retries_bounds_stderr"

interactive_stderr="$(mktemp)"
if node dist/index.js >/dev/null 2>"$interactive_stderr"; then
  echo "expected interactive mode to fail without TTY" >&2
  rm -f "$interactive_stderr"
  exit 1
fi
if ! grep -q "Interactive mode requires a TTY terminal" "$interactive_stderr"; then
  echo "non-TTY interactive error message mismatch" >&2
  rm -f "$interactive_stderr"
  exit 1
fi
rm -f "$interactive_stderr"

echo "CLI contract tests passed."
