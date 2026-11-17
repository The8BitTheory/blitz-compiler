#!/bin/bash
# probes/run.sh <c.prg>   run a compiled program (file from compile.sh) in headless VICE and report how it ended:
#   "END 01 05 03 20 ..."   = reached the runtime's END handler ($23A6); the bytes are $07D0..$07D7
#   "ERROR 18"              = reached the error handler ($24C0), number from the X register
#   "NO END, NO ERROR ..."  = neither within the cycle limit (hang / wild run)
# (image 1 programs; a program that uses graphics statements has the runtime at $4001 and other handler addresses - set END_ADDR/ERR_ADDR for that case)
HERE=$(cd "$(dirname "$0")" && pwd); X128=${X128:-x128}; C1541=${C1541:-c1541}
W=$(mktemp -d); END_ADDR=${END_ADDR:-23a6}; ERR_ADDR=${ERR_ADDR:-24c0}
$C1541 -format "w,01" d81 $W/w.d81 -write "$1" prog >/dev/null 2>&1
cat > $W/run.mon <<EOM
logname "$W/mon.log"
log on
break $END_ADDR
command 1 "bank ram;m 07d0 07d7;quit"
break $ERR_ADDR
command 2 "r;quit"
EOM
timeout ${TMO:-100} $X128 -default -warp -sounddev dummy -drive8type 1581 -8 $W/w.d81 -moncommands $W/run.mon \
  -limitcycles ${CYCLES:-150000000} -keybuf 'load"prog",8\nrun\n' > $W/vice.log 2>&1 || true
if grep -aq "^\.C:$ERR_ADDR" $W/mon.log; then
  X=$(grep -a "^\.C:$ERR_ADDR" $W/mon.log | head -1 | sed 's/.* X:\([0-9A-Fa-f][0-9A-Fa-f]\).*/\1/'); echo "ERROR $((16#$X))"
elif grep -aq "^\.C:$END_ADDR" $W/mon.log; then
  echo "END $(grep -a '^>C:07d' $W/mon.log | sed 's/^>C:[0-9a-f]*  //; s/ [^0-9a-f ].*$//' | tr '\n' ' ' | tr -s ' ' | sed 's/ *$//')"
else echo "NO END, NO ERROR within the cycle limit"; fi
rm -rf $W
