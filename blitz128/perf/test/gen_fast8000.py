"""perf/test/gen_fast8000.py <outdir> <lines>  -- side finding: FAST/SLOW leave the MMU at CR=$02 (BASIC ROM at $8000-$BFFF).
Generates programs whose last line lies behind <lines> padding lines (1400 -> bytecode around $8800, 2000 -> $A400):
a_poke (no FAST, reference), b_fast, c_fastnovar (FAST followed by statements without a variable access).
With the original runtime c_fastnovar fails when its last line lies at $8000-$BFFF (error 27 / wrong POKE)."""
import sys
S = sys.argv[1] + '/'
V = {'a_poke': 'x=1:poke 2000,1:poke 2001,2:poke 2002,3:end',
     'b_fast': 'x=1:fast:x=2:poke 2000,1:slow:x=3:end',
     'c_fastnovar': 'x=1:fast:print "a";:slow:poke 2000,7:end',
     'd_low': ''}
for name, last in V.items():
    L = ['10 x=0:goto 1000']
    n = int(sys.argv[2]) if last else 10
    for i in range(20, 20 + n): L.append('%d x=%d:y=%d:z=%d' % (i, 1000+i, 2000+i, 3000+i))
    L.append('1000 ' + (last or 'x=1:poke 2000,1:poke 2001,2:poke 2002,3:end'))
    open(S + name + '.bas', 'w').write('\n'.join(L) + '\n')
