10 rem **fi a,b
20 rem **fi a$
30 rem **fi a b
40 rem **ri 200
50 copy ("a") to ("b"):rename (a$) to (b$):copy "a",d0 to "b",d1 on u9:concat ("a") to ("b")
60 key 1,a$+"x":key a,"y":go 65:go
70 movspr 1,a;b:movspr 1,a#b:movspr 1,(a),(b):movspr a,+1,-1
80 play:sprsav a$,b$:paint 1,(a),(b):char 1,(a),(b),a$
90 rem "quoted":text
100 if a then begin:print:bend:print
110 do:loop while a:do until a:exit:loop
120 if a then begin
130 print "x"
140 bend:else begin
150 print "y":bend
160 begin:bend
170 dopen#1,"x",d0,u8,w:append#2,("x") on u9:dclose
180 circle 1,1,1,1,1,1,1,1,1:box 1,1,1,1,1,1,1:draw 1,1,1 to 2,2:locate (a),(b)
190 sshape a$,1,1,2,2:gshape a$,(a),(b),(c)
