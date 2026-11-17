#!/bin/bash
# probes/compile.sh <in.prg> <outdir> [BLITZ!.128]   compile ONE program with the real compiler in headless VICE
# (menu 1 = single drive, restricted syntax). Result: <outdir>/c.prg z.prg screen.txt.
# Needs x128 and c1541 from VICE (PATH, or X128=/C1541=), python3. BLITZ defaults to the repository's blitz!.128.prg;
# pass blitz128/fixed/blitz!.128.prg to use the fixed build.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$HERE/../../..
IN=$1; OUT=$2; BLITZ=${3:-${BLITZ:-$ROOT/blitz!.128.prg}}
X128=${X128:-x128}; C1541=${C1541:-c1541}
mkdir -p "$OUT"; W=$(mktemp -d)
$C1541 -format "work,01" d81 $W/w.d81 -write "$BLITZ" "blitz!.128" -write "$IN" prog >/dev/null 2>&1
cat > $W/st.mon <<EOM
break exec 23a6
command 1 "bank ram;save \"$W/scr.bin\" 0 0400 07e7;quit"
x
EOM
# the compiler ends in the runtime's END handler ($23A6): dump the screen there
timeout ${TMO:-170} $X128 -default -warp -sounddev dummy -drive8type 1581 -8 $W/w.d81 -moncommands $W/st.mon \
  -limitcycles ${CYCLES:-900000000} -keybuf 'load"blitz!.128",8\nrun\n1prog\n' > $W/vice.log 2>&1 || true
python3 "$ROOT/blitzc/oracle/scr.py" $W/scr.bin > "$OUT/screen.txt" 2>/dev/null || : > "$OUT/screen.txt"
for f in c z; do $C1541 -attach $W/w.d81 -read "$f/prog" "$OUT/$f.prg" >/dev/null 2>&1 || true; done
rm -rf $W
if grep -q "errors: 0" "$OUT/screen.txt"; then echo "compiled ok"; else echo "COMPILE PROBLEM:"; head -8 "$OUT/screen.txt"; exit 1; fi
