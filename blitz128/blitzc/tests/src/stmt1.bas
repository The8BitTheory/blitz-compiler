10 print:print a:print a;:print a,b:print "x";a;b$
20 print#1,a:print#1,"x";
30 input a:input "p";a$:input a,b$:input#1,a
40 get a$:get#1,a$:getkey a$
50 dim a(10):dim b(2,3),c$(5):dim d%(7)
60 data 1,2,"x",abc,3.5:read a,b$,c
70 restore:restore 60
80 goto 10:gosub 100:return
90 on a goto 10,20,30:on a gosub 10,20
100 if a then 10
110 if a then print "x"
120 if a=1 then b=2:c=3
130 if a goto 10
140 if a then print "y":else print "z"
150 stop:end:rem hallo
160 poke a,b:sys 4096:sys a,1,2,3
170 wait a,1:wait a,1,2
180 open 1,8,15,"i":close 1:cmd 4
190 let a=1:clr
200 print tab(5);spc(3);a
210 for i=1 to 10 step 2:next i
220 for j=10 to 1 step -1:next j,i
230 x=5
