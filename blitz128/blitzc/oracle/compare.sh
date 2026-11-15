#!/bin/bash
# Compile each PRG with the original (VICE) and with the JS port using the same keys; compare C/ and Z/.
# usage: compare.sh file.prg...      (work dir: ${OUT:-/tmp/cmp})
HERE=$(cd $(dirname $0); pwd); OUT=${OUT:-/tmp/cmp}; ok=0; bad=0
for f in "$@"; do
  n=$(basename "$f" .prg); o=$OUT/$n
  FRAMES=${FRAMES:-8000} TMO=${TMO:-590} CYCLES=${CYCLES:-900000000} bash $HERE/compile.sh "$f" $o/orig >/dev/null
  if [ ! -f $o/orig/c.prg ]; then echo "SKIP $n (original produced no C/: $(grep -i -m1 error $o/orig/screen.txt))"; continue; fi
  node $HERE/../js/cli.js "$f" $o/port --like $o/orig/c.prg >/dev/null
  r=""; for x in c z; do
    if [ -f $o/orig/$x.prg ] || [ -f $o/port/$x.prg ]; then cmp -s $o/orig/$x.prg $o/port/$x.prg || r="$r $x/differs"; fi
  done
  if [ -z "$r" ]; then ok=$((ok+1)); echo "ok   $n ($(stat -c%s $o/orig/c.prg) B, $(grep -o 'errors: [0-9]*' $o/orig/screen.txt))"
  else bad=$((bad+1)); echo "FAIL $n:$r"; fi
done
echo "== $ok identical, $bad different"
