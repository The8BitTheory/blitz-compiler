#!/usr/bin/env python3
"""Print the six per-compile keys of a Blitz!128 C/ file ($6A..$6F of the runtime):
bytecode, strings, varnames, operand-lo, operand-hi, misc. Key material = 6 header bytes,
XOR chain starting at $2F; at $46BC for $1C01 programs, $6C4D for $4001 programs."""
import sys
c=open(sys.argv[1],'rb').read(); la=c[0]|c[1]<<8; m=c[2:]
o=(0x46bc if la==0x1c01 else 0x6c4d)-la
a=0x2f; ks=[]
for x in m[o:o+6]: a^=x; ks.append(a)
print(' '.join('%02x'%k for k in ks))
