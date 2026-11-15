import pickle,sys
sys.path.insert(0,'.')
from rtdis import *
la,m=load(); base=la
code,ent=pickle.load(open('/tmp/rt.pkl','rb'))
def b(a): return m[a-base]
LOOP={0x27d4,0x27e3,0x27eb,0x27f6,0x27f8,0x27e9,0x27fc,0x27e0,0x27d0}
KN={0xffd2:'CHROUT',0xffe4:'GETIN',0xffcf:'CHRIN',0xffc3:'CLOSE',0xffc0:'OPEN',0xffc9:'CHKOUT',0xffc6:'CHKIN',0xffcc:'CLRCHN',0xffbd:'SETNAM',0xffba:'SETLFS',0xffd5:'LOAD',0xffd8:'SAVE',0xffb7:'READST',0xff81:'CINT',0xffe1:'STOP',0xfff0:'PLOT',0xff6c:'SETBNK',0xff68:'SETBNK',0xff5f:'SWAPPER',0xff62:'DLCHR',0xffa5:'ACPTR',0xffa8:'CIOUT'}
def summarize(start,depth=3):
    seen=set(); stack=[start]; jsrs=set(); ends=set(); kn=set(); ops=0; eor=set(); sta=set()
    while stack:
        pc=stack.pop()
        while pc in code and pc not in seen:
            seen.add(pc); n,t,tg,mn,mo,v=code[pc]
            if mn=='JSR' and tg is not None:
                if tg in KN: kn.add(KN[tg])
                else: jsrs.add(tg)
            if mn=='EOR' and mo=='imm': eor.add(v)
            if mo=='abs' and mn in('STA','STX','STY','LDA') and 0xff00<=v<=0xff0f: kn.add('MMU%02x'%(v&0xff))
            if mn=='JMP' and mo=='abs':
                if tg in LOOP: ends.add(tg)
                elif tg in code and len(seen)<300: stack.append(tg)
                else: ends.add(tg)
                break
            if mo=='rel': stack.append(tg)
            if mn in('RTS','RTI'): ends.add('RTS'); break
            pc+=n
    return jsrs,ends,kn,eor,len(seen)
if __name__=='__main__':
    print('MAIN TABLE')
    for x in range(0x0e,0x80):
        h=b(0x44b5+x)|b(0x4443+x)<<8
        j,e,k,eo,n=summarize(h)
        print('%02x -> %04x n=%3d kern=%s jsr=%s end=%s eor=%s'%(x,h,n,sorted(k),' '.join('%04x'%a for a in sorted(j))[:70],' '.join(('%04x'%a if a!='RTS' else a) for a in sorted(e,key=str))[:30],sorted('%02x'%a for a in eo)))
    print('EXT TABLE')
    for x in range(0,0x45):
        h=b(0x4665+x)|b(0x45b8+x)<<8
        j,e,k,eo,n=summarize(h)
        print('0.%02x -> %04x n=%3d kern=%s jsr=%s end=%s eor=%s'%(x,h,n,sorted(k),' '.join('%04x'%a for a in sorted(j))[:70],' '.join(('%04x'%a if a!='RTS' else a) for a in sorted(e,key=str))[:30],sorted('%02x'%a for a in eo)))
