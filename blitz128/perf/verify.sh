#!/bin/bash
# perf/verify.sh [tag] [cli options...]  correctness check of the Improved 2026 runtime: every test/probe program is compiled by the JS
# compiler twice, with the original runtime and with `--runtime improved <cli options>` (e.g. --fastmath on), and both are run in
# headless VICE.  How the program ended (END bytes / error number / first wait for input) and the screen must be identical.
# Image-1 ($1C01) and image-2 ($4001, graphics) programs; the breakpoints follow from the load address.
#   PRGS="a.prg b.prg" verify.sh ...   checks only some programs
cd "$(dirname "$0")"; TAG=${1:-imp}; shift; OPTS=("$@")
source ~/.nvm/nvm.sh >/dev/null 2>&1
PRGS=${PRGS:-$(ls ../blitzc/tests/src/*.prg ../analysis/runtime/probes/src/*.prg test/*.prg bench/*.prg)}
pass=0; fail=0; skip=0
addrs() {   # init / END / error handler of the original runtime image the file starts with
  case "$(head -c2 $1 2>/dev/null | od -An -tx1 | tr -d ' ')" in
    011c) echo "2221 23a6 24c0";;
    0140) echo "47b2 4937 4a51";;
    *) echo "";;
  esac
}
how() { grep -a -h -o "^#[45] (Stop on  exec ff..)\|^>C:07d0.*\|^\.C:$2 .* X:[0-9A-F]*" $1 | head -1 | sed 's/^#4.*/WAIT GETIN/; s/^#5.*/WAIT CHRIN/; s/^\.C:.* X:\(..\).*/ERROR X=\1/' | cut -c1-40; }
for src in $PRGS; do
  n=$(basename ${src%.prg}); d=out/v/$n; mkdir -p $d/o $d/$TAG
  node ../blitzc/js/cli.js $src $d/o/ --runtime original > $d/o/compile.txt 2>&1
  node ../blitzc/js/cli.js $src $d/$TAG/ --runtime improved "${OPTS[@]}" > $d/$TAG/compile.txt 2>&1
  A=$(addrs $d/o/c.prg); B=$(addrs $d/$TAG/c.prg)
  if [ -z "$A" ] || [ -z "$B" ]; then echo "skip $n (no C/ file: $(tail -1 $d/$TAG/compile.txt))"; skip=$((skip+1)); continue; fi
  set -- $A; [ -f $d/o/c.screen.txt ] || INIT=$1 END_ADDR=$2 ERR_ADDR=$3 CYCLES=${CYCLES:-400000000} SCR=1 ./run_bench.sh $d/o/c.prg
  set -- $B; INIT=$1 END_ADDR=$2 ERR_ADDR=$3 CYCLES=${CYCLES:-400000000} SCR=1 ./run_bench.sh $d/$TAG/c.prg
  a="$(how $d/o/c.mon.log $(echo $A | cut -d' ' -f3))"; b="$(how $d/$TAG/c.mon.log $(echo $B | cut -d' ' -f3))"
  if [ "$a" == "$b" ] && cmp -s $d/o/c.screen.txt $d/$TAG/c.screen.txt; then pass=$((pass+1)); echo "ok   $n  ${a:-limit}  ($(grep -o 'runtime: .*' $d/$TAG/compile.txt))"
  else fail=$((fail+1)); echo "FAIL $n  orig: ${a:-limit}  improved: ${b:-limit}"; fi
done
echo "passed $pass, failed $fail, skipped $skip"
