#!/usr/bin/env python3
"""run_4001.bin comes from a compiled program of the ORIGINAL compiler, whose image 2 is 10 bytes short (see ../../fixed/README.md):
the last 10 bytes ($6C37-$6C40) are RAM garbage there.  Write run_4001_fixed.bin with the missing bytes
(38 03 91 71 = low bytes of xop $41-$44, 82 C9 0F DA A1 00 = PI) so that runtime2.s describes the runtime as it is meant to be."""
import os
H = os.path.dirname(os.path.abspath(__file__))
d = bytearray(open(os.path.join(H, '..', 'run_4001.bin'), 'rb').read())
o = 2 + 0x6c37 - 0x4001
assert bytes(d[o:o + 10]) == bytes([0, 0, 0, 255, 255, 255, 255, 0, 0, 0]), 'unexpected tail (already fixed?)'
d[o:o + 10] = bytes([0x38, 0x03, 0x91, 0x71, 0x82, 0xc9, 0x0f, 0xda, 0xa1, 0x00])
open(os.path.join(H, 'run_4001_fixed.bin'), 'wb').write(d)
print('run_4001_fixed.bin')
