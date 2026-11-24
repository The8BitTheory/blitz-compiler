5 rem ** fi i,j,k
10 k=0:for i=1 to 3000:j=i and 7:k=k+j*2:if k>1000 then k=k-1000
20 next:poke 2000,k and 255:poke 2001,k/256:end
