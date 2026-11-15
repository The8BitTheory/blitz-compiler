10 do:a=a+1:loop
20 do while a<5:a=a+1:loop
30 do until a>5:a=a+1:loop
40 do:a=a+1:loop while a<9
50 do:a=a+1:loop until a>9
60 do:exit:loop
70 if a then begin:b=1:c=2:bend
80 if a then begin:b=1
90 c=2:bend:else begin:b=3
100 bend
110 trap 200:resume:resume next:resume 120
120 graphic 1,1:graphic 0:scnclr:scnclr 1
130 color 0,1:color 1,2
140 draw 1,10,20 to 30,40:draw ,5,5
150 box 1,10,10,50,50,45,1
160 circle 1,100,100,20,10,0,360,0,10
170 paint 1,50,50,1
180 char 1,10,5,"hi",1
190 locate 10,10:scale 1,320,200:scale 0
200 width 2:sshape a$,1,1,10,10:gshape a$,5,5,0
210 sound 1,1000,60:vol 15:envelope 1,5,5,5,5,1,100
220 tempo 10:play "cde":filter 1000,1,0,0,10
230 sprite 1,1,2,0,0,0,0:movspr 1,100,100:movspr 1,#45
240 sprcolor 1,2:sprsav 1,a$:collision 1,250
250 window 0,0,39,24,1:fast:slow:sleep 5
260 key 1,"list"+chr$(13):bank 15:go64
