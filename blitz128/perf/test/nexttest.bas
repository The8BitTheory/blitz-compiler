10 s=0:for i=0 to 300:s=s+i:next:print s;i
20 for i=0.5 to 20:s=s+i:next:print s;i
30 for i=-50 to 50:s=s+i:next:print s;i
40 for i=65530 to 65540:s=s+i:next:print s;i
50 for i=16777210 to 16777220:s=s+i:next:print s;i
60 for i=2147483640 to 2147483650:s=s+i/1e6:next:print s;i
90 for i=1 to 10 step 2.5:s=s+i:next:print s;i
100 for i=1e-3 to 3:s=s+i:next:print s;i
110 for i=255 to 257:for j=127 to 129:s=s+i*j:next:next:print s;i;j
120 for i=1 to 0:s=s+1:next:print s;i
130 for i=-3.5 to 2:s=s+i:next:print s;i
140 for i=1 to 3:i=i+0.25:next:print i
150 dim a(10),b%(10):for i=0 to 10:a(i)=i*1.5:b%(i)=-i:next:for i=10 to 0 step -1:s=s+a(i)*b%(i):next:print s;a(7);b%(7)
160 x$="ab":for i=1 to 5:x$=x$+chr$(64+i):next:print x$;len(x$)
170 end
