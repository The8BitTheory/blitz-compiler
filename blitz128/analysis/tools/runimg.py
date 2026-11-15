#!/usr/bin/env python3
"""Build the as-executed Blitz!128 runtime image: decrypt the self-decrypting
patcher block (JSR decryptor) and apply its key patches.
Works for image 1 (load $1C01) and image 2 (load $4001, e.g. C_CRAWL or the tail of BLITZ!.128).
usage: runimg.py in.prg out.bin [patcher.bin] [--img2]
The patcher block is re-encrypted afterwards, as the real code does: the same bytes are live opcode handlers.   (out.bin = 2-byte load address + memory)"""
import sys
def build(m, base):
    g=lambda a:m[a-base]
    # decryptor signature: TSX; LDA $0102,X; STA $64; LDA $0101,X; STA $63; LDY #n; LDA ($63),Y; EOR tab,Y
    sig=bytes([0xba,0xbd,0x02,0x01,0x85,0x64,0xbd,0x01,0x01,0x85,0x63,0xa0])
    d=m.find(sig); assert d>=0; dec=base+d
    n=g(dec+12); tab=g(dec+16)|g(dec+17)<<8
    call=m.find(bytes([0x20,dec&255,dec>>8])); assert call>=0; ret=base+call+2
    for y in range(1,n+1): m[ret+y-base]^=g(tab+y)
    s=ret+1   # decrypted patcher
    # parse patcher
    assert g(s)==0xa2 and g(s+2)==0xa9; a=g(s+3); keytab=g(s+5)|g(s+6)<<8
    keys=[]
    for i in range(6): a^=g(keytab+i); keys.append(a)
    K=dict(zip(range(0x6a,0x70),keys))
    pc=s+14; acc=keys[5]; log=[]
    ptr=None; lim=None
    while True:
        op=g(pc)
        if op==0x8d: t=g(pc+1)|g(pc+2)<<8; m[t-base]=acc; log.append((t,acc)); pc+=3
        elif op==0xa5 and g(pc+1) in K: acc=K[g(pc+1)]; pc+=2
        elif op==0xa5: break
        elif op==0xa2: lim=g(pc+1); pc+=2
        elif op==0xa9:  # LDA #lo ; STA $24 ; LDA #hi ; STA $25 ... scan loop (fixed layout, 0x2a bytes)
            ptr=g(pc+1)|g(pc+5)<<8; sigp=g(pc+0x1d)|g(pc+0x1e)<<8
            sg=[g(sigp+i) for i in range(3)]; key=K[g(pc+0x0b)]
            p=ptr
            while True:
                m[p+3-base]=key; log.append((p+3,key))
                while True:
                    p+=1
                    if p>>8==lim: break
                    if [g(p),g(p+1),g(p+2)]==sg: break
                if p>>8==lim: break
            pc+=0x26
        elif op==0x48 or op==0x4c: break
        else: raise SystemExit('unknown op %02x at %04x'%(op,pc))
    patcher=bytes(m[s-base:s-base+n])
    for y in range(1,n+1): m[ret+y-base]^=g(tab+y)   # re-encrypt (JMP $1E35): block is also live handler code
    return dec,ret,n,tab,keytab,keys,log,patcher
if __name__=='__main__':
    src,dst=sys.argv[1],sys.argv[2]
    c=open(src,'rb').read(); base=c[0]|c[1]<<8; m=bytearray(c[2:])
    if '--img2' in sys.argv and base==0x1c01:
        m=m[0xa065-0x1c01:]; base=0x4001
    dec,ret,n,tab,keytab,keys,log,patcher=build(m,base)
    if len(sys.argv)>3 and sys.argv[3].endswith('.bin'): open(sys.argv[3],'wb').write(patcher)
    print('load $%04x decryptor $%04x called from $%04x, %d bytes, table $%04x'%(base,dec,ret-2,n,tab))
    print('keys @$%04x:'%keytab,' '.join('%02x'%k for k in keys),' patches:',len(log))
    open(dst,'wb').write(bytes([base&255,base>>8])+m)
