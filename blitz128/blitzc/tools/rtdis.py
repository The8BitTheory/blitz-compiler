#!/usr/bin/env python3
"""Recursive-descent disassembler for the Blitz!128 runtime image (default: compiler image 1, $1c01..$46af)."""
import sys
sys.path.insert(0,'.')
from dis6502 import *
import os
def load(path=os.environ.get('RTIMG','../../blitz!.128.prg'), lo=0x1c01, hi=0x46b0, key_img=0x8464):
    c=open(path,'rb').read(); la=c[0]|c[1]<<8; m=c[2:]
    return la,m
def disasm(mem, base, lo, hi, entries, extra_labels=None):
    code={}   # addr -> (size, text, tgt, mn)
    todo=list(entries); seen=set()
    while todo:
        pc=todo.pop()
        while lo<=pc<hi and pc not in code:
            n,mn,mo,v,t,tg=decode(mem,pc,base)
            if mn=='.byte': break
            code[pc]=(n,t,tg,mn,mo,v)
            if mn in('JSR','JMP') and tg is not None and mo=='abs':
                if lo<=tg<hi: todo.append(tg)
            if mo=='rel' and lo<=tg<hi: todo.append(tg)
            if mn in('JMP','RTS','RTI','BRK'): break
            pc+=n
    return code
if __name__=='__main__':
    la,m=load(); base=la
    lo,hi=0x1c2f,0x46b0
    ent=[0x1c2f,0x2221]
    # trampolines & handler tables
    def b(a): return m[a-base]
    for x in range(0x0e,0x80): ent.append(b(0x44b5+x)|b(0x4443+x)<<8)
    for x in range(0,0x45): ent.append(b(0x4665+x)|b(0x45b8+x)<<8)
    ent=[e for e in ent if lo<=e<hi]
    code=disasm(m,base,lo,hi,ent)
    print(len(code),'instructions', sum(v[0] for v in code.values()),'bytes of',hi-lo)
    import pickle; pickle.dump((code,ent),open('/tmp/rt.pkl','wb'))
