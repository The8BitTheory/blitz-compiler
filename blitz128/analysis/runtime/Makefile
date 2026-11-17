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
	rm -f runtime.o runtime.bin runtime2.o runtime2.bin

# image 2 ($4001 runtime, graphics front ends)
all: runtime2.s check2
run_4001_fixed.bin: fix4001.py ../run_4001.bin
	python3 fix4001.py
runtime2.s: mkasm.py names.py run_4001_fixed.bin
	python3 mkasm.py --img2
runtime2.o: runtime2.s
	ca65 -o $@ runtime2.s
runtime2.bin: runtime2.o rt2.cfg
	ld65 -C rt2.cfg -o $@ runtime2.o
check2: runtime2.bin
	python3 -c "a=open('runtime2.bin','rb').read();b=open('run_4001_fixed.bin','rb').read()[2:2+len(a)];print('image 2 rebuilt',len(a),'bytes (expected',0x46b0+0x2591-0x4001,'):','IDENTICAL' if a==b and len(a)==0x46b0+0x2591-0x4001 else 'DIFFERS at '+hex(0x4001+next(i for i in range(len(a)) if a[i]!=b[i])))"
