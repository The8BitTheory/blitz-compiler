10 do while i<3:i=i+1:do:j=j+1:if j>5 then exit
20 loop until j>9:loop
30 if i=3 then begin
40 print "three"
50 bend:else begin:print "no":bend
60 on i gosub 100,200:trap 300:resume next
70 a$=mid$("hello",2,3)+left$("ab",1)+right$("cd",1)+chr$(65)+str$(5)+hex$(255)
80 x=instr(a$,"l"):y=asc("a")+len(a$)+val("12")+dec("ff")+abs(-3)+int(2.5)+sgn(-1)
90 end
100 return
200 return
300 resume
