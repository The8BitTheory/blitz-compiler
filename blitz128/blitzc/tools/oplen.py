#!/usr/bin/env python3
"""Derive bytecode operand lengths from the runtime handlers (abstract interpretation).
usage: oplen.py run_1c01.bin  -> table: opcode handler lengths"""
import sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from dis6502 import decode
c=open(sys.argv[1],'rb').read(); base=c[0]|c[1]<<8; m=c[2:]
b=lambda a:m[a-base]
EX={0x27d4:('i',1),0x27d6:('i',1),0x27e3:('i',2),0x27e5:('i',2),0x27e7:('i',2),0x27e9:('a',0),0x27eb:('a',0),0x27ec:('ac',0),
    0x27f6:('i',1),0x27f8:('i',1),0x27fc:('j',0),0x379c:('j',0),0x3791:('j',0),0x3792:('j',0),0x27d0:('j',0),0x27cc:('j',0),
    0x24a3:('err',0),0x24a0:('err',0),0x249d:('err',0),0x24a9:('err',0),0x24b5:('err',0),0x2497:('err',0),0x24ac:('err',0),0x24af:('err',0),0x24b2:('err',0),0x24b8:('err',0),0x24bb:('err',0),0x24be:('err',0),0x249a:('err',0)}
def run(start,y0):
    res=set(); seen=set(); todo=[(start,y0,None,0,0)]
    while todo:
        pc,y,a,inc,depth=todo.pop()
        steps=0
        while steps<400:
            steps+=1
            if pc in EX:
                k,v=EX[pc]
                if isinstance(inc,tuple) and k in('i','a','ac'): res.add('S'); break
                if k=='i': res.add(inc+v)
                elif k=='a': res.add(inc+a if a is not None else 'A?')
                elif k=='ac': res.add(('A+C',inc,a))
                elif k=='j': res.add('J')
                else: res.add('E')
                break
            key=(pc,y,a,inc)
            if key in seen: break
            seen.add(key)
            try: n,mn,mo,v,t,tg=decode(m,pc,base)
            except Exception: res.add('?%04x'%pc); break
            if mn=='.byte': res.add('?%04x'%pc); break
            if mn=='LDY' and mo=='imm': y=v
            elif mn=='INY' and y is not None: y=(y+1)&255
            elif mn=='DEY' and y is not None: y=(y-1)&255
            elif mn=='TAY': y=a
            elif mn=='LDA' and mo=='imm': a=v
            elif mn=='TYA': a=y
            elif mn in('LDA','TXA','PLA','ADC','SBC','EOR','AND','ORA','ASL','LSR','ROL','ROR') : a=None
            elif mn=='LDY' or mn=='TSX' and False: y=None
            if mn=='INC' and mo=='zp' and v==0x3b: inc+=1
            if mn=='STA' and mo=='zp' and v==0x3b: inc=('set',)
            if mn=='JSR':
                if tg==0x2d0a or tg==0x3a28: pass
                a=None
                if tg not in (0x2e5c,0x2e0f,0x2d0a,0x3a28,0x2e02,0x022c,0x022f,0x025e,0x0261,0x020e,0x021d,0x2d84,0x2d41,0x26ce,0x23b1,0x23ae,0x23c4,0x23c7,0x2e24,0x2e67,0x1e42,0x4314,0x4318,0x3041,0x406e,0x3a1e,0x39f7,0x2144,0x2178,0x2168,0x4225,0x3f93,0x0238,0x0287,0x02af,0x3232,0x0276,0x2fd3,0x2543,0x23b7,0x2d79): y=None
                if tg==0x39f7: inc=inc+1 if isinstance(inc,int) else inc; y=0
                pc+=3; continue
            if mn in('RTS','RTI','BRK'): res.add('R'); break
            if mn=='JMP':
                if mo=='ind': res.add('Ji'); break
                pc=tg; continue
            if mo=='rel':
                todo.append((tg,y,a,inc,depth)); pc+=n; continue
            pc+=n
        if isinstance(inc,tuple): pass
    return res
out=[]
for x in range(0x0e,0x80):
    h=b(0x44b5+x)|b(0x4443+x)<<8; out.append(('%02x'%x,h,run(h,0)))
for x in range(0,0x45):
    h=b(0x4665+x)|b(0x45b8+x)<<8; out.append(('00 %02x'%x,h,run(h,1)))
for k,h,r in out: print('%-6s %04x %s'%(k,h,sorted(map(str,r))))
