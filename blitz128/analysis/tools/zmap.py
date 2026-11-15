import sys; sys.path.insert(0,'.')
from bas7 import *
def zmap(path):
    z=open(path,'rb').read(); m=z[2:]; p=0; r=[]
    while p+4<=len(m):
        nxt=m[p]|m[p+1]<<8
        if nxt==0: break
        addr=m[p+2]|m[p+3]<<8
        e=m.find(b'\x00',p+4); 
        r.append((addr,detok(m[p+4:e]).strip())); p=e+1
    return r
