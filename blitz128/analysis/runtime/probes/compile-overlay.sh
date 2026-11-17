#!/bin/bash
# probes/compile-overlay.sh <outdir> <prog1.prg> <prog2.prg> ...   menu item 4 ("all programs ... with OVERLAY feature") of the real compiler
# in headless VICE. The programs are put on a source disk (device 8, in the given order), an empty disk is device 9. Result: <outdir>/<name>.prg per
# module (plain names, no C/ prefix), screen.txt. FULL=1 selects the full-syntax menu (6) instead of the restricted one (3). BLITZ=... selects the compiler file.
# Run a module chain with:  x128 -8 <outdir>/o.d81 ... (load the first module, RUN); probes/run.sh takes single c.prg files only.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$HERE/../../..
OUT=$1; shift
BLITZ=${BLITZ:-$ROOT/blitz!.128.prg}; X128=${X128:-x128}; C1541=${C1541:-c1541}
mkdir -p "$OUT"; W=$(mktemp -d)
$C1541 -format "comp,01" d81 $W/comp.d81 -write "$BLITZ" "blitz!.128" >/dev/null 2>&1
args=(); for p in "$@"; do args+=(-write "$p" "$(basename "${p%.prg}")"); done
$C1541 -format "src,01" d81 $W/src.d81 "${args[@]}" >/dev/null 2>&1
$C1541 -format "out,02" d81 $W/o.d81 >/dev/null 2>&1
cat > $W/st.mon <<EOM
break exec 2221
command 1 "attach \"$W/src.d81\" 8;x"
break exec 23a6
command 2 "bank ram;save \"$W/scr.bin\" 0 0400 07e7;quit"
x
EOM
# the compiler is loaded from device 8, then (at its start, $2221) the source disk replaces it: menu 3/6 = two single drives 8 -> 9, item 4, "Y" ready, "Y" format
KEYS='load"blitz!.128",8\nrun\n'$([ -n "$FULL" ] && echo 6 || echo 3)'8\n9\n4yy'
timeout ${TMO:-300} $X128 -default -warp -sounddev dummy -drive8type 1581 -8 $W/comp.d81 -drive9type 1581 -9 $W/o.d81 -moncommands $W/st.mon \
  -limitcycles ${CYCLES:-1500000000} -keybuf "$KEYS" > $W/vice.log 2>&1 || true
python3 "$ROOT/blitzc/oracle/scr.py" $W/scr.bin > "$OUT/screen.txt" 2>/dev/null || : > "$OUT/screen.txt"
for p in "$@"; do n=$(basename "${p%.prg}"); $C1541 -attach $W/o.d81 -read "$n" "$OUT/$n.prg" >/dev/null 2>&1 || true; done
cp $W/o.d81 "$OUT/o.d81"; rm -rf $W
if grep -q "errors: 0" "$OUT/screen.txt"; then echo "compiled ok"; else echo "COMPILE PROBLEM:"; head -8 "$OUT/screen.txt"; exit 1; fi
