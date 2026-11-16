10 rem ** fi i,j,k
20 rem ** ng
30 for i=1 to 10:j=j+i:k=k*2:next
40 graphic 1:draw 1,10,10
50 print j;k;"done"
60 rem ** ne
70 a=sqr(2)+3.14159265358979:b=1/3:c=123456789.123
80 data 1.5,-2,"a,b",xyz
90 read a,b,c$,d$:print a;b;c$;d$
