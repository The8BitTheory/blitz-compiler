#!/bin/bash
# perf/verify_overlay.sh [cli options...]  overlay chains (blitzc/tests/overlay/*) with the Improved 2026 runtime: every case is compiled by
# the JS compiler in overlay mode (one shared variable table, LOAD chaining) with the original and with the improved runtime, the .d81 is run
# in headless VICE (load + run the first module, the modules load each other) and the end (END bytes $07D0-$07D7 / error / wait) and the
# screen must be identical.  Event-driven: breakpoints on END / error handler / GETIN of both runtime images.
cd "$(dirname "$0")"; OPTS=("$@")
source ~/.nvm/nvm.sh >/dev/null 2>&1
pass=0; fail=0
run() {   # $1 = d81, $2 = first module, $3 = out prefix
  local W=$(mktemp -d)
  cat > $W/m.mon <<EOM
logname "$W/mon.log"
log on
break exec 23a6
command 1 "bank ram;m 07d0 07d7;save \"$W/scr.bin\" 0 0400 07e7;quit"
break exec 4937
command 2 "bank ram;m 07d0 07d7;save \"$W/scr.bin\" 0 0400 07e7;quit"
break exec 24c0
command 3 "r;save \"$W/scr.bin\" 0 0400 07e7;quit"
break exec 4a51
command 4 "r;save \"$W/scr.bin\" 0 0400 07e7;quit"
EOM
  timeout 120 x128 -default -warp -sounddev dummy -drive8type 1581 -8 $1 -moncommands $W/m.mon -limitcycles 400000000 \
    -keybuf "load\"$2\",8\nrun\n" > $W/vice.log 2>&1
  grep -a -o '^>C:07d0.*\|^\.C:\(24c0\|4a51\) .* X:[0-9A-F]*' $W/mon.log | head -1 | sed 's/^\.C:.* X:\(..\).*/ERROR X=\1/' | cut -c1-40 > $3.end
  python3 ../blitzc/oracle/scr.py $W/scr.bin > $3.screen 2>/dev/null || echo "(no screen)" > $3.screen
  rm -rf $W
}
for c in ../blitzc/tests/overlay/*/; do
  n=$(basename $c); d=out/ovl/$n; mkdir -p $d/o $d/i
  order=$(python3 -c "import json;print(' '.join(json.load(open('$c/case.json'))['order']))")
  full=$(python3 -c "import json;print('--full' if json.load(open('$c/case.json')).get('full') else '')")
  set -- $order; first=$1; shift; plain=$(for m in "$@"; do printf "%s," "$c/src/$m.prg"; done)
  node ../blitzc/js/cli.js $c/src/$first.prg $d/o/ --plain ${plain%,} --overlay $full --keys 7b,cb,84,6d,96,a8 --d81 $d/o/all.d81 --runtime original > $d/o/compile.txt 2>&1
  node ../blitzc/js/cli.js $c/src/$first.prg $d/i/ --plain ${plain%,} --overlay $full --keys 7b,cb,84,6d,96,a8 --d81 $d/i/all.d81 --runtime improved "${OPTS[@]}" > $d/i/compile.txt 2>&1
  F=$(echo $first | tr A-Z a-z)
  run $d/o/all.d81 $F $d/o/r; run $d/i/all.d81 $F $d/i/r
  if [ -s $d/o/r.end ] && cmp -s $d/o/r.end $d/i/r.end && cmp -s $d/o/r.screen $d/i/r.screen; then pass=$((pass+1)); echo "ok   $n  $(cat $d/o/r.end)"
  else fail=$((fail+1)); echo "FAIL $n  orig: $(cat $d/o/r.end)  improved: $(cat $d/i/r.end)"; fi
done
echo "passed $pass, failed $fail"
