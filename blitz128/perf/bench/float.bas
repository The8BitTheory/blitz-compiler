10 x=0:for i=1 to 300:x=x+sin(i/100)*1.5:y=sqr(i)*x/3.7:next
20 poke 2000,int(x) and 255:poke 2001,int(y) and 255:end
