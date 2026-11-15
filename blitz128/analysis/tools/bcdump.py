#!/usr/bin/env python3
"""bcdump.py C_file Z_file [source.prg ...]  -- dump the (5a-decrypted) bytecode of a Blitz!128 compiled program per BASIC line.
Layer 1: every bytecode byte is stored XOR $5a.  Layer 2 (jump targets): after layer 1, word = (b0^$7d, b1^$0e) = absolute target address.
Confirmed opcodes (see REPORT.md): 01=RETURN, 06 tt tt=GOSUB, 4e tt tt=GOTO/THEN-line."""
import sys; sys.path.insert(0,sys.path[0] or '.')
from zmap import *
def main(cfile,zfile,srcs):
    a=open(cfile,'rb').read()[2:]; base=0x1c01
    z=zmap(zfile)
    S=[dict(lines(open(s,'rb').read())) for s in srcs]
    for k in range(len(z)-1):
        ad,txt=z[k]; nx=z[k+1][0]; ln=int(txt.lstrip('= ').strip() or 0)
        b=bytes(x^0x5a for x in a[ad-base:nx-base])
        t=set(detok(s[ln]) for s in S if ln in s)
        src=list(t)[0] if len(t)==1 else ('?' if not t else '<versions differ>')
        ann=''
        if b[:1]==b'\x06' and len(b)>=3: ann='  ; GOSUB $%04x'%((b[1]^0x7d)<<8|(b[2]^0x0e))
        print('%04x %6d  %-48s | %s%s'%(ad,ln,src[:48],b.hex(' '),ann))
if __name__=='__main__': main(sys.argv[1],sys.argv[2],sys.argv[3:])
