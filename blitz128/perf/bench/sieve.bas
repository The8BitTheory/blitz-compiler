10 dim f%(4002):c=0:for i=2 to 2000:if f%(i) then 40
20 c=c+1:for j=i+i to 2000 step i:f%(j)=1:next
40 next:poke 2000,c and 255:poke 2001,c/256:end
