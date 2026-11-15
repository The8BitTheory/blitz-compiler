import sys
def off(t,s): return ((t-1)*40+s)*256
class D81:
    def __init__(s,data): s.d=bytearray(data)
    def bam_slot(s,t):
        if t<=40: return off(40,1)+16+(t-1)*6
        return off(40,2)+16+(t-41)*6
    def is_free(s,t,sec):
        b=s.bam_slot(t); return bool(s.d[b+1+sec//8]>>(sec%8)&1)
    def alloc(s,t,sec):
        b=s.bam_slot(t); assert s.is_free(t,sec)
        s.d[b+1+sec//8]&=~(1<<(sec%8)); s.d[b]-=1
    def next_free(s,start_t=1):
        order=[t for t in list(range(39,0,-1))+list(range(41,81))]  # fill outward from dir track
        for t in order:
            for sec in range(40):
                if s.is_free(t,sec): return t,sec
        raise Exception('disk full')
    def free_dir_entry(s):
        t,sec=40,3
        while True:
            b=s.d[off(t,sec):off(t,sec)+256]
            for i in range(8):
                if b[i*32+2]==0: return t,sec,i
            if b[0]==0:
                # extend dir
                for nsec in range(3,40):
                    if s.is_free(40,nsec):
                        s.alloc(40,nsec); o=off(40,sec); s.d[o]=40; s.d[o+1]=nsec
                        o=off(40,nsec); s.d[o:o+256]=bytes(256); s.d[o+1]=0xff
                        return 40,nsec,0
                raise Exception('dir full')
            t,sec=b[0],b[1]
    def add(s,name,data,ftype=0x82):
        chunks=[data[i:i+254] for i in range(0,len(data),254)] or [b'']
        secs=[]
        for _ in chunks:
            t,sc=s.next_free(); s.alloc(t,sc); secs.append((t,sc))
        for i,c in enumerate(chunks):
            o=off(*secs[i]); s.d[o:o+256]=bytes(256)
            if i<len(chunks)-1: s.d[o]=secs[i+1][0]; s.d[o+1]=secs[i+1][1]; s.d[o+2:o+2+len(c)]=c
            else: s.d[o]=0; s.d[o+1]=len(c)+1; s.d[o+2:o+2+len(c)]=c
        t,sec,i=s.free_dir_entry(); o=off(t,sec)+i*32
        e=bytearray(32); e[2]=ftype; e[3],e[4]=secs[0]
        nm=name.encode('latin1')[:16].ljust(16,b'\xa0'); e[5:21]=nm
        e[30]=len(secs)&0xff; e[31]=len(secs)>>8
        # keep link bytes of first entry in sector
        link=bytes(s.d[o:o+2]) if i==0 else b'\0\0'
        s.d[o:o+32]=e
        if i==0: s.d[o],s.d[o+1]=link
    @staticmethod
    def blank(template,name='WORK',did='01'):
        d=bytearray(template)
        # wipe everything except track 40 header/BAM, then rebuild
        h=bytes(d[off(40,0):off(40,0)+256])
        out=bytearray(819200)
        out[off(40,0):off(40,0)+256]=h
        hd=out[off(40,0):off(40,0)+256]
        hd[4:20]=name.encode().ljust(16,b'\xa0'); hd[22:24]=did.encode()
        out[off(40,0):off(40,0)+256]=hd
        for k,sec in ((1,1),(2,2)):
            o=off(40,sec); b=bytearray(256)
            b[0]=40 if k==1 else 0; b[1]=2 if k==1 else 0xff; b[2]=0x44; b[3]=0xbb; b[4:6]=did.encode(); b[6]=0xc0
            for tt in range(40):
                t=tt+1+(0 if k==1 else 40); p=16+tt*6
                b[p]=40; b[p+1:p+6]=b'\xff'*5
            out[o:o+256]=b
        dd=D81(out)
        for sec in (0,1,2,3): dd.alloc(40,sec)
        o=off(40,3); dd.d[o]=0; dd.d[o+1]=0xff
        return dd
if __name__=='__main__':
    pass
