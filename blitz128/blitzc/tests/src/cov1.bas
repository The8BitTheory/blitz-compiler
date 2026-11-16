10 new:run:run 100:sprdef
20 stash 100,4096,0,0:fetch 100,4096,0,0:swap 100,4096,0,0
30 collision 1,100:collision 2:collision 3,200
40 sys 4096,1,2,3:sys 4096,1,2,3,4:sys 4096,1,2,3,4,5,6:sys 4096,,,,7:sys 4096,1,2,3,4,"hi":x=1
50 rreg a:rreg a,b,c,d:rreg ,b,,d
60 rem **ri 50
70 rem **ri
80 dopen#1,"f",w:dopen#2,"g",l80,d0,u8:dopen#3,(a$),d1 on u9:dclose#1:dclose on u8
90 append#1,"f",d0,u8:dclear d0,u8:catalog d1,u9:directory "a*",d0 on u8
100 copy "a" to "b":copy d0,"a" to d1,"b",u8:rename "a" to "b",d0:backup d0 to d1:concat "a" to "b",d0,u8
110 header "x",i01,d0:scratch "a",d0,u8:collect d0:dverify "a",d0:bload "x",b0,p4096:bsave "x",b0,p4096 to p8192
120 record#1,5,2:record#1,5:record#1,(a),(b)
130 sprsav a$,1:sprsav 1,a$:sprsav 1,2
140 movspr 1,10,20:movspr 1,+10,-20:movspr 1,10;20:movspr 1,90#5
150 sound 1,1000,60,1,500,20,1,1000:sound 2,500,30,,,,2
160 key:key 2,"x":go to 10:go64
170 char 1,10,5,"hi":char ,1,1,"x",1:box 1,1,1:circle 1,100,100,20
180 paint 1,50,50:paint ,1,1,1:draw 1:draw ,1,1 to 2,2 to 3,3
190 gshape a$:gshape a$,1,1,4:sshape a$,1,1:locate 1,1:scale 1:width 1
200 rem **sp31415
210 dim m(2,3):m(1)=1:m(1,2,3)=2:a=m(1,2,3)
220 window 0,0,10,10:bend:loop
230 print using "##";a:fast:slow:sleep 1:bank 1
240 a=rspcolor(1)+rsppos(1,1)+rsprite(1,1)+bump(1)+pen(1)+pot(1)+joy(1)+rdot(1)+rgr(0)+rclr(1)
250 a=pointer(a)+fre(0)+pos(0)+usr(1)+rwindow(0)+xor(1,2)+peek(1)+len(a$)
260 tron:troff:help:auto:delete 10:renumber:monitor:quit:off
