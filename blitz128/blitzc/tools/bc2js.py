#!/usr/bin/env python3
"""Translate the Blitz!128 compiler's own bytecode (BLITZ!.128) into JavaScript.

Works on the bytecode directly (not on compiler_decomp.bas), so the
decompiler's display artefacts (`?`, multi-index ARRn(...)) do not matter:
all arrays of the compiler are one-dimensional, and FOR/GET/READ/INPUT take
the variable that was loaded last as a reference.

usage: bc2js.py ../../fixed/blitz!.128.prg > ../js/compiler.gen.js   (the fixed compiler; the original gives the same code except the title)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bcdis import decode

c = open(sys.argv[1], 'rb').read(); la = c[0] | c[1] << 8; m = c[2:]
g = lambda a: m[a - la]
H1 = 0x46b0
K = []; a = 0x2f
for i in range(6): a ^= g(H1 + 12 + i); K.append(a)
w = lambda o, k: (g(o) ^ k) | (g(o + 1) ^ k) << 8
vt = w(H1, 0x97); ve = w(H1 + 2, 0x97); txt = w(H1 + 10, 0x79)

# ---- variable names / types
names = []
for o in range(vt, ve - 1, 2):
    x, y = g(o) ^ K[2], g(o + 1) ^ K[2]
    t = '$' if (x < 128 and y >= 128) else '%' if (x >= 128 and y >= 128) else ''
    names.append(chr(x & 127) + (chr(y & 127) if y & 127 else '') + t)
def jsname(n):
    return n.replace('%', '_i').replace('$', '_s') + ('' if n[-1] in '%$' else '_f')
VN = [jsname(n) for n in names]
VT = [n[-1] if n[-1] in '%$' else 'f' for n in names]

bs = [0] * (txt + 1 - la) + [g(x) ^ K[0] for x in range(txt + 1, vt)] + [0] * 8
def tgt(i): return ((bs[i] ^ K[0] ^ K[3]) << 8) | (bs[i + 1] ^ K[0] ^ K[4])
def sstr(i, n): return ''.join(chr(g(la + i + k) ^ K[1]) for k in range(n))

# ---- pass 1: instructions + labels
ins = []; labels = set(); i = txt + 1 - la
while i < vt - la:
    n, mn, op = decode(bs, i); ins.append((i + la, n, mn, op))
    b = bs[i]
    if b in (0x19, 0x52, 0x5a): labels.add(tgt(i + 1))
    if b == 0x1a: labels.add(tgt(i + 1)); labels.add(i + la + n)      # GOSUB: target + return point
    if b in (0x1b, 0x1c):
        for k in range(i + 2, i + n, 2): labels.add(tgt(k))
        if b == 0x1c: labels.add(i + la + n)
    if b == 0x1f: labels.add(i + la + bs[i + 1])
    if b == 0x11: labels.add(i + la + n)                             # FOR: loop start
    i += n
labels.add(ins[0][0])

def jsq(s):
    r = ''
    for ch in s:
        o = ord(ch)
        r += ch if 32 <= o < 127 and ch not in '"\\' else '\\x%02x' % o
    return '"' + r + '"'

class E:  # expression on the symbolic stack
    def __init__(s, code, var=None, arr=None): s.code = code; s.var = var; s.arr = arr

def mflpt(op):
    e = op[0]
    if e == 0: return 0.0
    mant = ((op[1] | 0x80) << 24 | op[2] << 16 | op[3] << 8 | op[4]) / 2 ** 32
    return mant * 2 ** (e - 128) * (-1 if op[1] & 0x80 else 1)

BINJS = {1: 'gt', 2: 'eq', 3: 'ge', 4: 'lt', 5: 'ne', 6: 'le', 0xc: 'and', 0xd: 'or'}
FN1 = {0x20: 'sgn', 0x21: 'int', 0x27: 'rnd', 0x2e: 'peek', 0x2f: 'len', 0x30: 'str', 0x31: 'val',
       0x32: 'asc', 0x33: 'chr'}
FN2 = {0x34: 'left', 0x35: 'right'}
ARRT = {}  # array number -> type

out = []; st = []
def emit(s): out.append('      ' + s)
def pop(): return st.pop()
def store(slot, e):
    t = VT[slot]
    if t == '%': emit('v.%s=rt.toInt(%s);' % (VN[slot], e.code))
    else: emit('v.%s=%s;' % (VN[slot], e.code))
def goto(t): return 'pc=%d;continue;' % t

for addr, n, mn, op in ins:
    i = addr - la; b = bs[i]
    if addr in labels:
        assert not st, 'stack not empty at label %04x' % addr
        out.append('    case %d: // L%04X' % (addr, addr))
    nxt = addr + n
    if b == 0:
        raise SystemExit('extended opcode %02x at %04x not handled' % (bs[i + 1], addr))
    elif b < 0x0e:
        y = pop(); x = pop()
        if b in BINJS: st.append(E('rt.%s(%s,%s)' % (BINJS[b], x.code, y.code)))
        elif b == 0xb: st.append(E('rt.pow(%s,%s)' % (x.code, y.code)))
        else: st.append(E('(%s%s%s)' % (x.code, {7: '+', 8: '-', 9: '*', 0xa: '/'}[b], y.code)))
    elif b == 0x0e: st.append(E('(-%s)' % pop().code))
    elif b == 0x0f: st.append(E('rt.not(%s)' % pop().code))
    elif b in FN1: st.append(E('rt.%s(%s)' % (FN1[b], pop().code)))
    elif b in FN2: y = pop(); x = pop(); st.append(E('rt.%s(%s,%s)' % (FN2[b], x.code, y.code)))
    elif b == 0x36: z = pop(); y = pop(); x = pop(); st.append(E('rt.mid(%s,%s,%s)' % (x.code, y.code, z.code)))
    elif 0x80 <= b < 0xa0 or b in (0xa0, 0xa1, 0xa2, 0xa3):
        slot = b - 0x80 if b < 0xa0 else op[0]
        st.append(E('v.%s' % VN[slot], var=slot))
    elif b == 0xa4:
        x = pop(); st.append(E('rt.aget(A[%d],%s)' % (op[0], x.code), arr=(op[0], x.code)))
    elif mn == '#': st.append(E(str(op[0])))
    elif mn == '#F': st.append(E(repr(mflpt(op))))
    elif b == 0xab: st.append(E('rt.st'))
    elif b == 0xaf: st.append(E('rt.tiS()'))
    elif mn == '$':
        k = op[0]; s0 = i + (2 if b == 0xe7 else 1); st.append(E(jsq(sstr(s0, k))))
    elif 0xc0 <= b < 0xe0: store(b - 0xc0, pop())
    elif b in (0xe0, 0xe1, 0xe2, 0xe3): store(op[0], pop())
    elif b == 0xe4:
        val = pop(); idx = pop(); t = ARRT[op[0]]
        conv = 'rt.toInt(%s)' % val.code if t == '%' else val.code
        emit('rt.aset(A[%d],%s,%s);' % (op[0], idx.code, conv))
    elif b == 0x10:  # DIM nd name(2) arr(2)
        nd = bs[i + 1]; x, y = bs[i + 2], bs[i + 3]; an = bs[i + 4] << 8 | bs[i + 5]
        assert nd == 1
        t = '$' if (x < 128 and y >= 128) else '%' if (x >= 128 and y >= 128) else 'f'
        ARRT[an] = t
        emit('A[%d]=rt.dim(%s,%s);' % (an, pop().code, jsq(t)))
    elif b == 0x11:  # FOR var=<current> TO limit
        var = pop(); lim = pop(); assert var.var is not None
        emit('rt.forPush(%s,%s,%d);' % (jsq(VN[var.var]), lim.code, nxt))
    elif b == 0x13:
        emit('{const t=rt.next(v); if(t!==null){pc=t;continue;}}')
    elif b == 0x15: emit('rt.clr();')
    elif b == 0x17: ad = pop(); val = pop(); emit('rt.poke(%s,%s);' % (ad.code, val.code))
    elif b == 0x19: emit(goto(tgt(i + 1)))
    elif b == 0x1a: emit('rs.push(%d);%s' % (nxt, goto(tgt(i + 1))))
    elif b in (0x1b, 0x1c):
        x = pop(); ts = [tgt(k) for k in range(i + 2, i + n, 2)]
        pre = 'rs.push(%d);' % nxt if b == 0x1c else ''
        emit('{const t=[%s][rt.int(%s)-1]; if(t!==undefined){%spc=t;continue;}}' % (','.join(map(str, ts)), x.code, pre))
    elif b == 0x1d: emit('pc=rs.pop();continue;')
    elif b == 0x1e: emit('rt.restore();')
    elif b == 0x1f: emit('if(!rt.T(%s)){%s}' % (pop().code, goto(addr + bs[i + 1])))
    elif b == 0x52: emit('if(rt.T(%s)){%s}' % (pop().code, goto(tgt(i + 1))))
    elif b == 0x5a: emit('if(!rt.T(%s)){%s}' % (pop().code, goto(tgt(i + 1))))
    elif b == 0x58: emit('if(rt.T(%s)){pc=rs.pop();continue;}' % pop().code)
    elif b == 0x3c: emit('rt.pr(%s);' % pop().code)
    elif b == 0x3e: emit('rt.prcr(%s);' % (pop().code if st else '""'))
    elif b == 0x40: emit('rt.spc(%s);' % pop().code)
    elif b == 0x42: emit('rt.cmd(%s);' % pop().code)
    elif b == 0x43: emit('rt.prhcr(%s);' % (pop().code if st else '""'))
    elif b == 0x45: emit('rt.prhend();')
    elif b in (0x46, 0x4a, 0x51, 0x53, 0x55):
        var = pop(); assert var.var is not None, 'ref op %02x at %04x' % (b, addr)
        f = {0x46: 'get', 0x4a: 'read', 0x51: 'inLast', 0x53: 'inOnly', 0x55: 'inNext'}[b]
        emit('rt.%s(v,%s,%s);' % (f, jsq(VN[var.var]), jsq(VT[var.var])))
    elif b == 0x48: emit('rt.inch(%s);' % pop().code)
    elif b == 0x4e: emit('rt.sys(%s);' % pop().code)
    elif b == 0x4f: emit('return rt.end();')
    elif b == 0x50: emit('rt.input();')
    elif b == 0x56: emit('rt.setTi(%s);' % pop().code)
    elif b == 0x60:
        k = bs[i + 1]; args = [pop().code for _ in range(k)]   # lfn, dev, sa, name
        emit('rt.open(%s);' % ','.join(args))
    elif b == 0x61: emit('rt.close(%s);' % pop().code)
    else:
        raise SystemExit('opcode %02x (%s) at %04x not handled' % (b, mn, addr))
assert not st

print('// GENERATED by tools/bc2js.py from BLITZ!.128 (Skyles V860929, fixed build) - do not edit.')
print('// One case per jump target of the original bytecode; label = original address.')
print('export const VARS=%s;' % repr([[n, VN[k], VT[k]] for k, n in enumerate(names)]).replace("'", '"'))
print('export function run(rt){')
print('  const v=rt.v, A=rt.A, rs=rt.rs; let pc=%d;' % ins[0][0])
print('  for(;;){ rt.tick(); switch(pc){')
print('\n'.join(out))
print('    default: throw new Error("bad pc "+pc);')
print('  }}')
print('}')
