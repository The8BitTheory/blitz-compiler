#!/bin/bash
# Compile a tokenized BASIC 7 PRG with the ORIGINAL Blitz!128 compiler in headless VICE.
# usage: compile.sh <in.prg> <outdir> [menukey=1] [extra_keys_before_menu]
# Result in outdir: c.prg z.prg d.prg (if present), screen.txt (final screen), keys.txt
set -e
HERE=$(cd $(dirname $0); pwd); VICE=${VICE:-$HOME/vice}
BLITZ=${BLITZ:-$HERE/../../blitz!.128.prg}
IN=$1; OUT=$2; MENU=${3:-1}; PRE=$4
mkdir -p $OUT; W=$(mktemp -d)
C1541=$VICE/vice-3.9/src/c1541
$C1541 -format "work,01" d81 $W/w.d81 -write "$BLITZ" "blitz!.128" -write "$IN" "prog" >/dev/null 2>&1
cat > $W/st.mon <<EOF
break exec 2221
command 1 "enable 2;x"
break exec ff17
ignore 2 ${FRAMES:-1c20}
disable 2
command 2 "bank ram;save \"$W/scr.bin\" 0 0400 07e7;quit"
x
EOF
export LD_LIBRARY_PATH=$VICE/tools/usr/lib/x86_64-linux-gnu
timeout ${TMO:-170} $VICE/vice-3.9/src/x128 -directory $VICE/inst/share/vice -warp -sounddev dummy \
  -drive8type 1581 -8 $W/w.d81 -moncommands $W/st.mon -limitcycles 900000000 \
  -keybuf "load\"blitz!.128\",8\nrun\n$PRE${MENU}prog\n" > $W/vice.log 2>&1 || true
python3 $HERE/scr.py $W/scr.bin > $OUT/screen.txt
for f in c z d p; do $C1541 -attach $W/w.d81 -read "$f/prog" $OUT/$f.prg >/dev/null 2>&1 || rm -f $OUT/$f.prg; done
$C1541 -attach $W/w.d81 -dir > $OUT/dir.txt 2>/dev/null || true
[ -f $OUT/c.prg ] && python3 -I $HERE/../tools/keys.py $OUT/c.prg > $OUT/keys.txt
rm -rf $W
grep -q "errors: 0" $OUT/screen.txt && echo "ok $OUT" || { echo "FAIL $OUT"; cat $OUT/screen.txt | head -8; }
