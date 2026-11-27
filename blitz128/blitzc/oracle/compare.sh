#!/bin/bash
# Compile each PRG with the original (VICE) and with the JS port using the same keys; compare C/ and Z/.
# usage: [MODE=1|4|35|65] compare.sh file.prg...      (work dir: ${OUT:-/tmp/cmp})
#   MODE 1 = with runtime, limited syntax (default)   4 = with runtime, full RESUME/COLLISION syntax
#   MODE 35 = without runtime, limited syntax         65 = without runtime, full syntax
HERE=$(cd $(dirname $0); pwd); OUT=${OUT:-/tmp/cmp}; ok=0; bad=0; MODE=${MODE:-1}
case $MODE in 1) MK=1; PF="";; 4) MK=4; PF="--full";; 35) MK='38\n9\n5'; PF="--no-runtime"; export TWO=1;; 65) MK='68\n9\n5'; PF="--no-runtime --full"; export TWO=1;; esac
for f in "$@"; do
  n=$(basename "$f" .prg); [ $MODE != 1 ] && n=$n.m$MODE; o=$OUT/$n
  FRAMES=${FRAMES:-8000} TMO=${TMO:-590} CYCLES=${CYCLES:-900000000} bash $HERE/compile.sh "$f" $o/orig "$MK" >/dev/null
  if [ ! -f $o/orig/c.prg ]; then echo "SKIP $n (original produced no C/: $(grep -i -m1 error $o/orig/screen.txt))"; continue; fi
  node $HERE/../js/cli.js "$f" $o/port --runtime original $PF --like $o/orig/c.prg >/dev/null
  r=""; for x in c z; do
    if [ -f $o/orig/$x.prg ] || [ -f $o/port/$x.prg ]; then cmp -s $o/orig/$x.prg $o/port/$x.prg || r="$r $x/differs"; fi
  done
  if [ -z "$r" ]; then ok=$((ok+1)); echo "ok   $n ($(stat -c%s $o/orig/c.prg) B, $(grep -o 'errors: [0-9]*' $o/orig/screen.txt))"
  else bad=$((bad+1)); echo "FAIL $n:$r"; fi
done
echo "== $ok identical, $bad different"
