#!/bin/bash
# perf/bench.sh <tag> [proto.s ...]  build every benchmark with the given prototypes (none = original runtime) and print
# cycles (init -> END) and the result bytes, compared with the original run.
cd "$(dirname "$0")"; TAG=$1; shift
for b in ${BENCH:-loop fi float str arr sieve}; do
  P=out/$b/c.prg
  if [ $# -gt 0 ]; then python3 mkimg.py out/$b/c.prg out/$b/$TAG.prg "$@" >/dev/null || exit 1; P=out/$b/$TAG.prg; fi
  ./run_bench.sh $P
  L=${P%.prg}.mon.log
  cyc=$(grep -a Stopwatch: $L | awk '{print $2}'); res=$(grep -a '^>C:07d0' $L | cut -c10-20)
  base=$(grep -a Stopwatch: out/$b/c.mon.log | awk '{print $2}'); bres=$(grep -a '^>C:07d0' out/$b/c.mon.log | cut -c10-20)
  if grep -aq '^\.C:24c0' $L; then res="ERROR"; fi
  ok=OK; [ "$res" == "$bres" ] || ok="WRONG($res vs $bres)"
  printf "%-6s %10s %10s %6s  %s\n" $b "$base" "${cyc:-?}" "$(python3 -c "print('%+.1f%%'%((${cyc:-0}-$base)*100/$base))")" "$ok"
done
