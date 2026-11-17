all: runtime.s check
runtime.s: mkasm.py names.py ../run_1c01.bin
	python3 mkasm.py
runtime.o: runtime.s
	ca65 -o $@ runtime.s
runtime.bin: runtime.o rt.cfg
	ld65 -C rt.cfg -o $@ runtime.o
check: runtime.bin
	python3 -c "import sys;a=open('runtime.bin','rb').read();b=open('../run_1c01.bin','rb').read()[2:2+len(a)];print('rebuilt',len(a),'bytes (expected',0x46b0-0x1c01,'):','IDENTICAL' if a==b and len(a)==0x46b0-0x1c01 else 'DIFFERS at '+hex(0x1c01+next(i for i in range(len(a)) if a[i]!=b[i])))"
clean:
	rm -f runtime.o runtime.bin
