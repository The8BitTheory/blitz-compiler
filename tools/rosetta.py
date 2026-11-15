#!/usr/bin/env python3
"""Line-by-line source <-> bytecode for an oracle output dir.
usage: rosetta.py <src.bas> <outdir>   (outdir has c.prg, z.prg)
Bytecode shown after XOR with key0; string-constant chars decoded with key1 and shown as 'text'."""
import sys,re
src={}
for l in open(sys.argv[1]):
    m=re.match(r'\s*(\d+)\s*(.*)',l.rstrip('\n'))
    if m: src[int(m.group(1))]=m.group(2)
c=open(sys.argv[2]+'/c.prg','rb').read(); la=c[0]|c[1]<<8; m=c[2:]; g=lambda a:m[a-la]
hk=0x46bc if la==0x1c01 else 0x6c4d
h1=0x46b0 if la==0x1c01 else None
a=0x2f; K=[]
for i in range(6): a^=g(hk+i); K.append(a)
z=open(sys.argv[2]+'/z.prg','rb').read()[2:]; p=0; lines=[]
while p+4<=len(z):
    if (z[p]|z[p+1]<<8)==0: break
    ad=z[p+2]|z[p+3]<<8; e=z.find(b'\x00',p+4); txt=z[p+4:e].decode('latin1')
    ln=int(re.sub(r'[^0-9]','',txt) or 0); lines.append((ad,ln)); p=e+1
if la==0x1c01:
    w=lambda o:(g(o)^0x97)|(g(o+1)^0x97)<<8
    vt=w(0x46b0)
else:
    vt=None
if '--vt' in sys.argv: vt=int(sys.argv[sys.argv.index('--vt')+1],16)
end=vt if vt else la+len(m)
print('keys',' '.join('%02x'%k for k in K),' vartab $%04x'%end if vt else '')
for i,(ad,ln) in enumerate(lines):
    nx=lines[i+1][0] if i+1<len(lines) else end
    bs=[g(x)^K[0] for x in range(ad,nx)]
    out=[];j=0
    while j<len(bs):
        b=bs[j]
        if 0xe8<=b<=0xee or b==0xe7:
            n=b-0xe8 if b!=0xe7 else bs[j+1]; s=j+1 if b!=0xe7 else j+2
            raw=[g(ad+s+k) for k in range(n)]
            out.append('%02x\'%s\''%(b,''.join(chr(r^K[1]) if 32<=(r^K[1])<127 else '\\x%02x'%(r^K[1]) for r in raw))); j=s+n; continue
        out.append('%02x'%b); j+=1
    print('%5d %-34s| %s'%(ln,src.get(ln,'?')[:34],' '.join(out)))
if vt:
    n=[(g(x)^K[2]) for x in range(vt,la+len(m))]
    names=[]
    for k in range(0,len(n)-1,2):
        a,b=n[k],n[k+1]; t='$' if (a&0x80==0 and b&0x80) else '%' if (a&0x80 and b&0x80) else 'fn' if a&0x80 else ''
        names.append(chr(a&0x7f)+(chr(b&0x7f) if b&0x7f else '')+t)
    print('vars:',' '.join('%d:%s'%(i,x) for i,x in enumerate(names)))
