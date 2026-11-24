#!/bin/bash
# perf/run_bench.sh <c.prg>  run a compiled program (image 1) in headless x128 and log how it ended to <c>.mon.log:
#   cycles from runtime init ($2221) to END ($23A6) (`Stopwatch:`), bytes $07D0..$07D3, or the error handler ($24C0),
#   or the first wait for input after init (KERNAL GETIN $FFE4 / CHRIN $FFCF).
# SCR=1   also dump the screen at the end to <c>.screen.txt
# PROF=1  VICE profiler from init to END (`prof flat $PROFN`); PROFX = monitor commands instead of the final `quit`
#         (a `playback` file there must end with `quit` itself)
# Event driven: breakpoints only; the timeout and -limitcycles are guards against hangs.
P=$1; W=$(mktemp -d); END_ADDR=${END_ADDR:-23a6}; ERR_ADDR=${ERR_ADDR:-24c0}; INIT=${INIT:-2221}
c1541 -format "w,01" d81 $W/w.d81 -write "$P" prog >/dev/null 2>&1
PON=""; POFF=""; TAIL="quit"
if [ -n "$PROF" ]; then PON="prof on;"; POFF="prof off;prof flat ${PROFN:-60};"; TAIL="${PROFX:-quit}"; fi
SAVE=""; [ -n "$SCR" ] && SAVE='save \"'$W'/scr.bin\" 0 0400 07e7;'
cat > $W/run.mon <<EOM
logname "$W/mon.log"
log on
break exec $INIT
command 1 "sw reset;${PON}enable 4;enable 5;del 1;x"
break exec $END_ADDR
command 2 "sw;bank ram;m 07d0 07d3;${SAVE}${POFF}${TAIL}"
break exec $ERR_ADDR
command 3 "r;${SAVE}quit"
break exec ffe4
command 4 "${SAVE}quit"
disable 4
break exec ffcf
command 5 "${SAVE}quit"
disable 5
EOM
timeout ${TMO:-300} x128 -default -warp -sounddev dummy -drive8type 1581 -8 $W/w.d81 -moncommands $W/run.mon \
  -limitcycles ${CYCLES:-2000000000} -keybuf 'load"prog",8\nrun\n' > $W/vice.log 2>&1
cp $W/mon.log "${P%.prg}.mon.log"
if [ -n "$SCR" ]; then
  if [ -f $W/scr.bin ]; then python3 "$(dirname "$0")/../blitzc/oracle/scr.py" $W/scr.bin > "${P%.prg}.screen.txt"; else echo "(no screen: cycle limit)" > "${P%.prg}.screen.txt"; fi
fi
rm -rf $W
