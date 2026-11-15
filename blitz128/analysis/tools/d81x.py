import sys,os
d=open(sys.argv[1],'rb').read(); out=sys.argv[2]
def off(t,s): return ((t-1)*40+s)*256
def chain(t,s):
    o=b'';seen=[]
    while t and (t,s) not in seen and 1<=t<=80 and s<40:
        seen.append((t,s));b=d[off(t,s):off(t,s)+256]
        if b[0]==0: o+=b[2:b[1]+1];break
        o+=b[2:]; t,s=b[0],b[1]
    return o,len(seen)
t,s=40,3;seen=set()
while t and (t,s) not in seen:
    seen.add((t,s));b=d[off(t,s):off(t,s)+256]
    for i in range(8):
        e=b[i*32:(i+1)*32]
        if any(e[2:30]):
            n=e[5:21].rstrip(b'\xa0').decode('latin1').replace('/','_')
            data,nb=chain(e[3],e[4])
            print('%-16s type=%02x blocks(dir)=%3d blocks(chain)=%3d bytes=%6d load=%s'%(n,e[2],e[30]|e[31]<<8,nb,len(data),data[:2].hex()))
            open(os.path.join(out,n+('' if e[2]&0x80 else '.scratched')+'.prg'),'wb').write(data)
    t,s=b[0],b[1]
