10 dopen#1,"test",w:dclose#1:append#1,"x"
20 dload "x":dsave "y":bload "z",b0,p4096:bsave "z",b0,p4096 to p8192
30 catalog:directory:header "disk",i01:scratch "x"
40 rename "a" to "b":copy "a" to "b":concat "a" to "b"
50 record#1,5:backup d0 to d1:collect:dverify "x"
60 dclear:boot "x":verify "x":load "x",8:save "x",8
70 print using "##.#";a:pudef "*"
80 rreg a,b,c,d:monitor
90 a$=a$+b$:mid$(a$,2,1)="x"
100 ti$="000000":poke 1,2
110 open 1,8,2,"f,s,w":print#1,a$:close 1
120 run:run 10:cont
130 list:new
