#!/bin/bash
# probes/check.sh [probe ...]   compile every probe of expected.txt with the real compiler in VICE, run it and compare with the expected result.
# About 30 s per probe. Uses the compiler file of the repository unless BLITZ=... is set. Exit code 1 if anything differs.
HERE=$(cd "$(dirname "$0")" && pwd); cd "$HERE"
T=$(mktemp -d); bad=0
while read -r name comp rest; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  [ $# -gt 0 ] && ! printf '%s\n' "$@" | grep -qx "$name" && continue
  want=$(echo "$rest" | sed 's/   *.*//')
  if ./compile.sh src/$name.prg $T/$name >/dev/null 2>&1; then got=$(./run.sh $T/$name/c.prg); else got="COMPILE FAILED"; fi
  if [ "$got" = "$want" ]; then echo "ok    $name: $got"; else echo "DIFF  $name: got '$got', expected '$want'"; bad=1; fi
done < expected.txt
rm -rf $T; exit $bad
