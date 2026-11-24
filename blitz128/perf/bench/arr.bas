10 dim a(100),b%(100):for k=1 to 10:for i=0 to 100:a(i)=i*2:b%(i)=a(i)+k:next:next
20 poke 2000,b%(50) and 255:end
