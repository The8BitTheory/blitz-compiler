#!/usr/bin/env python3
"""Check that bcdis lengths tile every Z/ line exactly. usage: checklen.py outdir..."""
import sys,os,re
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from bcdis import decode
for d in sys.argv[1:]:
    c=open(d+'/c.prg','rb').read(); la=c[0]|c[1]<<8; m=c[2:]; g=lambda a:m[a-la]
    H1=0x46b0 if la==0x1c01 else 0x6c41
    a=0x2f; K=[]
    for i in range(6): a^=g(H1+12+i); K.append(a)
    vt=(g(H1)^0x97)|(g(H1+1)^0x97)<<8
    z=open(d+'/z.prg','rb').read()[2:]; p=0; L=[]
    while p+4<=len(z) and (z[p]|z[p+1]<<8):
        e=z.find(b'\0',p+4); L.append((z[p+2]|z[p+3]<<8, z[p+4:e].decode('latin1').strip('= '))); p=e+1
    bad=0
    for k,(ad,ln) in enumerate(L):
        nx=L[k+1][0] if k+1<len(L) else vt
        bs=[g(x)^K[0] for x in range(ad,nx)]+[0]*8; i=0; ops=[]
        while i<nx-ad:
            n,mn,op=decode(bs,i); ops.append(mn); i+=n
        if i!=nx-ad: bad+=1; print(d,ln,'overrun',i-(nx-ad),ops[-4:])
    print(d,'lines',len(L),'bad',bad)
