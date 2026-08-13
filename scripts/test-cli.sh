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

assert_plain_output() {
  local label="$1"
  shift
  local stdout_file="$cli_test_root/$label.out"
  local stderr_file="$cli_test_root/$label.stderr"

  "$@" > "$stdout_file" 2> "$stderr_file"
  if [[ -s "$stderr_file" ]] || LC_ALL=C grep -q $'\033' "$stdout_file"; then
    echo "$label emitted color or an unexpected warning" >&2
    exit 1
  fi
}

assert_plain_exit_code() {
  local label="$1"
  local expected_exit_code="$2"
  shift 2
  local stdout_file="$cli_test_root/$label.out"
  local stderr_file="$cli_test_root/$label.stderr"
  local actual_exit_code

  if "$@" > "$stdout_file" 2> "$stderr_file"; then
    actual_exit_code=0
  else
    actual_exit_code=$?
  fi
  if [[ "$actual_exit_code" -ne "$expected_exit_code" ]]; then
    echo "$label exited with $actual_exit_code, expected $expected_exit_code" >&2
    exit 1
  fi
  if [[ -s "$stderr_file" ]] || LC_ALL=C grep -q $'\033' "$stdout_file"; then
    echo "$label emitted color or an unexpected warning" >&2
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

assert_plain_output plain env NO_COLOR=1 FORCE_COLOR=3 node dist/index.js about --plain
assert_plain_output theme-color-plain node dist/index.js theme color on --plain
assert_plain_output stored-color-plain node dist/index.js about --plain
assert_plain_output theme-reset-plain env NBTCA_COLOR_MODE=on node dist/index.js theme reset --plain

if [[ "$(node dist/index.js roadmap)" != "https://github.com/orgs/nbtca/projects/5" ]]; then
  echo "roadmap output mismatch" >&2
  exit 1
fi
if [[ "$(node dist/index.js docs)" != "https://docs.nbtca.space" ]]; then
  echo "docs output mismatch" >&2
  exit 1
fi
open_down_import='--import=data:text/javascript,import%20cp%20from%20%22node:child_process%22;cp.spawn=()=>{throw%20Error(%22blocked%22)}'
assert_fails_with browser-website 'Open manually: https://nbtca.space' env NODE_OPTIONS="$open_down_import" node dist/index.js website --open --plain
assert_fails_with browser-github 'Open manually: https://github.com/nbtca' env NODE_OPTIONS="$open_down_import" node dist/index.js github --open --plain
assert_fails_with browser-roadmap 'Open manually: https://github.com/orgs/nbtca/projects/5' env NODE_OPTIONS="$open_down_import" node dist/index.js roadmap --open --plain
assert_fails_with browser-repair 'Open manually: https://nbtca.space/repair' env NODE_OPTIONS="$open_down_import" node dist/index.js repair --open --plain

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
watch_cancel_import='--import=data:text/javascript,Object.defineProperty(process.stdin,%22isTTY%22,{value:true,configurable:true});Object.defineProperty(process.stdout,%22isTTY%22,{value:true,configurable:true});setTimeout(()=>process.exit(70),1500).unref();let%20stopped=false;globalThis.fetch=(_input,init)=>{if(!stopped){stopped=true;queueMicrotask(()=>process.emit(%22SIGINT%22))}return%20new%20Promise((_resolve,reject)=>{const%20abort=()=>reject(init.signal.reason);if(init.signal.aborted)abort();else%20init.signal.addEventListener(%22abort%22,abort,{once:true})})}'
assert_plain_exit_code status-watch-cancel 130 env NODE_OPTIONS="$watch_cancel_import" node dist/index.js status --watch --interval=3 --timeout=20000 --retries=5 --plain
assert_fails_with events-next-format '--next=<number>' node dist/index.js events --next=1x
assert_fails_with events-heatmap-today '--heatmap cannot be combined' node dist/index.js events --heatmap --today
assert_fails_with events-heatmap-week '--heatmap cannot be combined' node dist/index.js events --heatmap --week
assert_fails_with events-heatmap-month '--heatmap cannot be combined' node dist/index.js events --heatmap --month
assert_fails_with events-heatmap-next '--heatmap cannot be combined' node dist/index.js events --heatmap --next=1
assert_fails_with events-heatmap-search '--heatmap cannot be combined' node dist/index.js events --heatmap --search=ca
assert_fails_with events-range-today-week 'Choose only one event range' node dist/index.js events --today --week
assert_fails_with events-range-today-month 'Choose only one event range' node dist/index.js events --today --month
assert_fails_with events-range-week-month 'Choose only one event range' node dist/index.js events --week --month
future_date="$(node -e 'const value = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10).replaceAll("-", ""); process.stdout.write(value)')"
legal_events_import="--import=data:text/javascript,globalThis.fetch=async()=>new%20Response(%22BEGIN:VCALENDAR%5CnVERSION:2.0%5CnPRODID:-//nbtca//contract//EN%5CnBEGIN:VEVENT%5CnUID:cli-contract-sentinel%5CnDTSTART;VALUE=DATE:$future_date%5CnSUMMARY:CLI%20contract%20sentinel%5CnLOCATION:fixture%5CnEND:VEVENT%5CnEND:VCALENDAR%22,{status:200})"
legal_events_file="$cli_test_root/legal-events.json"
NODE_OPTIONS="$legal_events_import" node dist/index.js events --search=sentinel --next=1 --json > "$legal_events_file"
node -e '
  const fs = require("node:fs");
  const events = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (events.length !== 1 || events[0]?.uid !== "cli-contract-sentinel") process.exit(1);
' "$legal_events_file"
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
update_down_import='--import=data:text/javascript,globalThis.fetch=async()=>new%20Response(null,{status:503})'
assert_fails_with update-network 'Could not check for updates' env NODE_OPTIONS="$update_down_import" node dist/index.js update --plain
update_reject_import='--import=data:text/javascript,globalThis.fetch=async()=>{throw%20Error(%22offline%22)}'
assert_fails_with update-reject 'Could not check for updates' env NODE_OPTIONS="$update_reject_import" node dist/index.js update --plain
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

ignored_status_import='--import=data:text/javascript,setTimeout(()=>process.exit(70),2500).unref();globalThis.fetch=()=>new%20Promise(()=>{})'
ignored_status_file="$cli_test_root/status-ignored-signal.json"
if NODE_OPTIONS="$ignored_status_import" node dist/index.js status --json --timeout=1000 --retries=0 \
  > "$ignored_status_file" 2> "$cli_test_root/status-ignored-signal.stderr"; then
  echo "status unexpectedly succeeded when fetch ignored its timeout signal" >&2
  exit 1
fi
node -e '
  const fs = require("node:fs");
  const statuses = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (
    statuses.length !== 8 ||
    statuses.some((item) => item.ok || item.error !== "Request timed out")
  ) process.exit(1);
' "$ignored_status_file"
if [[ -s "$cli_test_root/status-ignored-signal.stderr" ]]; then
  echo "status timeout emitted an unexpected warning" >&2
  exit 1
fi

intranet_down_import="--import=data:text/javascript,globalThis.fetch=async(input)=>new%20Response(null,{status:['cloud.nbtca.space','i.nbtca.space'].includes(new%20URL(String(input)).hostname)%3F503%3A200})"
intranet_output="$(NODE_OPTIONS="$intranet_down_import" node dist/index.js status --plain --timeout=1000 --retries=0)"
if [[ "$intranet_output" != *"Public services are healthy; intranet availability depends on your network"* ]]; then
  echo "intranet-only failure returned the wrong summary" >&2
  exit 1
fi
assert_fails_with non-tty 'Interactive mode requires a TTY terminal' node dist/index.js

echo "CLI contract tests passed."
