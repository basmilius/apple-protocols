#!/bin/bash
# Usage: capture.sh <repo> <outdir> <scenario> <device> [call args...]
# Records traffic, events and errors around one action so two checkouts can be compared.
set -u
repo="$1"; out="$2"; scenario="$3"; device="$4"; shift 4
mkdir -p "$out"
cd "$repo" || exit 1

d() { bun packages/diagnostics/cli/diag.ts "$@"; }
settle() { timeout 10 bun packages/diagnostics/cli/diag.ts wait traffic --grep ZZZ_NO_MATCH --timeout "${1:-3}" >/dev/null 2>&1; }

case "$scenario" in
    connect)
        d disconnect "$device" >/dev/null 2>&1
        settle 2
        d mark >/dev/null
        timeout 60 bun packages/diagnostics/cli/diag.ts connect "$device" > "$out/$scenario.result.txt" 2>&1
        echo "exit $?" >> "$out/$scenario.result.txt"
        settle 4
        ;;
    call)
        scenario="call-$(echo "$*" | tr ' /' '__')"
        d mark >/dev/null
        timeout 30 bun packages/diagnostics/cli/diag.ts call "$device" "$@" > "$out/$scenario.result.txt" 2>&1
        echo "exit $?" >> "$out/$scenario.result.txt"
        settle 2
        ;;
    invoke)
        # invoke <label> <settle seconds> <channel> <json>
        scenario="invoke-$1"; wait_s="$2"; shift 2
        d mark >/dev/null
        timeout 90 bun packages/diagnostics/cli/diag.ts invoke "$@" > "$out/$scenario.result.txt" 2>&1
        echo "exit $?" >> "$out/$scenario.result.txt"
        settle "$wait_s"
        ;;
esac

d traffic --since-mark --device "$device" --limit 500 > "$out/$scenario.traffic.txt" 2>&1
d traffic --since-mark --device "$device" --limit 500 --decoded > "$out/$scenario.decoded.txt" 2>&1
d events --since-mark --device "$device" --limit 300 > "$out/$scenario.events.txt" 2>&1
d logs --since-mark --device "$device" --group error > "$out/$scenario.errors.txt" 2>&1
wc -l "$out/$scenario".*.txt | sed "s|$out/||"
