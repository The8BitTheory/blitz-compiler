#!/bin/bash
# perf/bench2.sh <tag> [cli options...]  benchmarks with the JS compiler: original runtime vs --runtime improved <options>
# (both compiled from bench/*.bas, run in headless VICE); cycles init->END and check of the result bytes.
cd "$(dirname "$0")"; TAG=${1:-imp}; shift; OPTS=("$@")
source ~/.nvm/nvm.sh >/dev/null 2>&1
for b in ${BENCH:-loop fi float str arr sieve}; do
  d=out/b2/$b; mkdir -p $d/o $d/$TAG
  [ -f $d/o/c.mon.log ] || { node ../blitzc/js/cli.js bench/$b.prg $d/o/ --runtime original >/dev/null; ./run_bench.sh $d/o/c.prg; }
  node ../blitzc/js/cli.js bench/$b.prg $d/$TAG/ --runtime improved "${OPTS[@]}" >/dev/null; ./run_bench.sh $d/$TAG/c.prg
  base=$(grep -a Stopwatch: $d/o/c.mon.log | awk '{print $2}'); cyc=$(grep -a Stopwatch: $d/$TAG/c.mon.log | awk '{print $2}')
  r1=$(grep -a '^>C:07d0' $d/o/c.mon.log | cut -c10-20); r2=$(grep -a '^>C:07d0' $d/$TAG/c.mon.log | cut -c10-20)
  ok=OK; [ "$r1" == "$r2" ] || ok="WRONG($r2 vs $r1)"
  printf "%-6s %10s %10s %7s  %s\n" $b "$base" "${cyc:-?}" "$(python3 -c "print('%+.1f%%'%((${cyc:-0}-$base)*100/$base))")" "$ok"
done
