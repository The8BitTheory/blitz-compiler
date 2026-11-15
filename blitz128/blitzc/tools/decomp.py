#!/usr/bin/env python3
"""Decompile Blitz!128 bytecode back to (pseudo) BASIC.
usage: decomp.py <c.prg> [--raw]"""
import sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from bcdis import decode,BIN,MAIN
c=open(sys.argv[1],'rb').read(); la=c[0]|c[1]<<8; m=c[2:]; g=lambda a:m[a-la]
H1=0x46b0 if la==0x1c01 else 0x6c41
K=[]; a=0x2f
for i in range(6): a^=g(H1+12+i); K.append(a)
w=lambda o,k:(g(o)^k)|(g(o+1)^k)<<8
vt=w(H1,0x97); ve=w(H1+2,0x97); ent=w(H1+6,0x79); dat=w(H1+8,0x79); txt=w(H1+10,0x79)
names=[]
for o in range(vt,ve-1,2):
    x,y=g(o)^K[2],g(o+1)^K[2]
    t='$' if (x<128 and y>=128) else '%' if (x>=128 and y>=128) else 'FN' if x>=128 else ''
    s=chr(x&127)+(chr(y&127) if y&127 else '')
    names.append(('FN'+s) if t=='FN' else s+t)
def V(i): return names[i] if i<len(names) else 'V%d'%i
start=ent
bs=[0]*(start-la)+[g(x)^K[0] for x in range(start,vt)]+[0]*8
def tgt(i): return ((bs[i]^K[0]^K[3])<<8)|(bs[i+1]^K[0]^K[4])
def sstr(i,n): return ''.join(chr(g(la+i+k)^K[1]) for k in range(n))
# pass 1: instructions + labels
ins=[]; labels=set(); i=txt+1-la
pre=[]
while i<vt-la:
    n,mn,op=decode(bs,i); ins.append((i+la,n,mn,op))
    b=bs[i]
    if b in(0x19,0x1a,0x52,0x5a,0x74): labels.add(tgt(i+1))
    if b in(0x1b,0x1c):
        for k in range(i+2,i+n,2): labels.add(tgt(k))
    if b==0x1f: labels.add(i+la+bs[i+1])
    if b==0x37: labels.add(i+la+bs[i+5])
    if b==0 and bs[i+1] in(0x14,0x15): labels.add(tgt(i+2))
    i+=n
arrays={}
ARITY1={0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x2a,0x2b,0x2c,0x2d,0x2e,0x2f,0x30,0x31,0x32,0x33,0x59,0x69,0x6a,0x6b,0x6c,0x6d,0x6e,0x70,0x72,0x7a,0x4d,0x0e,0x0f}
ARITY={0x34:2,0x35:2,0x36:3,0x68:2,0x71:3}
out=[]; st=[]
def q(s):
    r=''
    for ch in s:
        o=ord(ch)
        r+=ch if 32<=o<127 and ch!='"' else '{%02x}'%o
    return '"'+r+'"'
def flush(prefix=''):
    global st
    s=prefix+(' ' if prefix and st else '')+','.join(st); st=[]; return s
lab=lambda a:'L%04X'%a
cur=[]
def emit(s):
    cur.append(s)
def line_break(addr):
    global cur
    if cur: out.append('       '+':'.join(cur)); cur=[]
    out.append(lab(addr)+':')
raw='--raw' in sys.argv
for addr,n,mn,op in ins:
    i=addr-la; b=bs[i]
    if addr in labels:
        if st: emit('<stk '+','.join(st)+'>'); st=[]
        line_break(addr)
    if raw: emit('%s%s'%(mn,op)); continue
    if b==0:
        x=bs[i+1]
        if x in(0x14,0x15): emit('X%02x(%s)->%s'%(x,flush(),lab(tgt(i+2))))
        elif x in(0x0d,0x0e): y=st.pop();z=st.pop(); st.append('X%02x(%s,%s)'%(x,z,y))
        elif x==0x09: st.append('PEN(%s)'%st.pop())
        else: emit('X%02x %s'%(x,flush()))
    elif b<0x0e:
        y=st.pop(); z=st.pop() if st else '?'; st.append('(%s%s%s)'%(z,BIN[b],y))
    elif b in ARITY1 and st: st.append('%s(%s)'%(MAIN[b],st.pop()))
    elif b in ARITY and len(st)>=ARITY[b]:
        k=ARITY[b]; args=st[-k:]; del st[-k:]; st.append('%s(%s)'%(MAIN[b],','.join(args)))
    elif b==0x38: st.append('FN@%d(%s)'%(op[0]|op[1]<<8 if False else (bs[i+1]|bs[i+2]<<8),st.pop()))
    elif b>=0x80 and b<0xa0: st.append(V(b-0x80))
    elif b in(0xa0,0xa1,0xa2,0xa3): st.append(V(op[0]))
    elif b in(0xa4,0xa5):
        # array: pops index count unknown -> use all pending as indices
        idx=st[:] if b==0xa4 else st[:]; st=[]; st.append('ARR%d(%s)'%(op[0],','.join(idx)))
    elif mn=='#' : st.append(str(op[0]))
    elif mn=='#F':
        e=op[0]
        if e==0: st.append('0.0')
        else:
            mant=((op[1]|0x80)<<24|op[2]<<16|op[3]<<8|op[4])/2**32; v=mant*2**(e-128)*(-1 if op[1]&0x80 else 1)
            st.append(repr(v))
    elif b in(0xa9,0xaa,0xab,0xac,0xad,0xae,0xaf,0xe6): st.append(mn)
    elif mn=='$':
        k=op[0]; s0=i+(2 if b==0xe7 else 1); st.append(q(sstr(s0,k)))
    elif b>=0xc0 and b<0xe0: emit('%s=%s'%(V(b-0xc0),flush()))
    elif b in(0xe0,0xe1,0xe2,0xe3): emit('%s=%s'%(V(op[0]),flush()))
    elif b in(0xe4,0xe5):
        val=st.pop() if st else '?'; emit('ARR%d(%s)=%s'%(op[0],','.join(st),val)); st=[]
    elif b in(0x19,0x1a): emit('%s %s %s'%(flush(),MAIN[b],lab(tgt(i+1))) if st else '%s %s'%(MAIN[b],lab(tgt(i+1))))
    elif b in(0x52,0x5a): emit('IF%s %s GOTO %s'%(' NOT' if b==0x5a else '',flush(),lab(tgt(i+1))))
    elif b in(0x1b,0x1c): emit('ON %s %s %s'%(flush(),'GOTO' if b==0x1b else 'GOSUB',','.join(lab(tgt(k)) for k in range(i+2,i+n,2))))
    elif b==0x1f: emit('IF NOT %s SKIP %s'%(flush(),lab(addr+bs[i+1])))
    elif b==0x74: emit('TRAP %s'%lab(tgt(i+1)))
    elif b==0x37: emit('DEF FN@%d(@%d) [->%s]'%(op[0],op[1],lab(addr+op[2])))
    elif b==0x10: emit('DIM ARR%d %s nd=%d (%s)'%(bs[i+4]<<8|bs[i+5],chr(bs[i+2]&127)+chr(bs[i+3]&127),bs[i+1],flush()))
    else: emit('%s %s'%(MAIN.get(b,'OP%02x'%b),flush()) if st else MAIN.get(b,'OP%02x'%b)+(' %s'%(op,) if op else ''))
if st: emit('<stk '+','.join(st)+'>')
line_break(vt)
print('REM keys',' '.join('%02x'%k for k in K),'vars',len(names),'ent %04x data %04x txt %04x vt %04x'%(ent,dat,txt,vt))
print('REM vars:',' '.join(names))
print('\n'.join(out[1:-1]))
# DATA table: items = len, text, line(lo,hi); 0xff ends
p=dat; cur=None; acc=[]
print('REM ---- DATA table @%04x'%dat)
while p<txt+1:
    n=g(p)^K[5]
    if n==0xff: break
    t=''.join(chr(g(p+1+k)^K[5]) for k in range(n)); ln=(g(p+1+n)^K[5])|(g(p+2+n)^K[5])<<8
    if ln!=cur:
        if acc: print('%d DATA %s'%(cur,','.join(acc)))
        cur=ln; acc=[]
    acc.append(''.join(ch if 32<=ord(ch)<127 else '{%02x}'%ord(ch) for ch in t)); p+=n+3
if acc: print('%d DATA %s'%(cur,','.join(acc)))
