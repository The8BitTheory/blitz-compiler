import re,sys,collections,pickle
path=sys.argv[1]
ev=[]  # (A, ptr)
A=None
rx=re.compile(r'^\.C:2800\s+F0 9D\s+BEQ \$279F\s+- A:([0-9A-F]{2}) X:([0-9A-F]{2})')
rm=re.compile(r'^>C:003b\s+([0-9a-f]{2}) ([0-9a-f]{2})')
for line in open(path,errors='replace'):
    m=rx.match(line)
    if m: A=int(m.group(1),16); X=int(m.group(2),16); continue
    m=rm.match(line)
    if m and A is not None:
        ev.append((A,int(m.group(1),16)|int(m.group(2),16)<<8,X)); A=None
print('events',len(ev))
pickle.dump(ev,open('/tmp/ev.pkl','wb'))
d=collections.defaultdict(collections.Counter)
for (a,p,x),(a2,p2,x2) in zip(ev,ev[1:]):
    d[a][p2-p]+=1
print('op  count  top deltas')
for a in sorted(d):
    tot=sum(d[a].values()); top=d[a].most_common(4)
    print('%02x %6d  %s'%(a,tot,'  '.join('%+d:%d'%(k,v) for k,v in top)))
