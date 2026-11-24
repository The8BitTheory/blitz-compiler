10 for i=1 to 200:a$="":for j=1 to 10:a$=a$+chr$(65+j):next:b$=mid$(a$,3,4)+left$(a$,2):next
20 poke 2000,asc(b$):poke 2001,len(a$):end
