#!/usr/bin/env python3
"""Make the fixed Blitz!128 compiler from the BLITZ!.128 of this repository (Skyles V860929, a cracked copy with the dongle check disabled).

usage: patch_blitz128.py [in.prg [out.prg [yymmdd]]]
  defaults: ../../blitz!.128.prg  ../../fixed/blitz!.128.prg  <today as yymmdd>

THE DEFECT.  BLITZ!.128 carries two runtime images that the compiler copies into every C/ file: image 1 ($1C01-$46AF) and
image 2 ($4001-$6C40, used for programs with graphics statements), which is appended at file offset $8467.  The file is 10 bytes
too short: image 2 ends at $6C36 (offset $B09B) although the runtime needs $6C40.  When the compiler writes a C/ file it copies the
full 11 328 bytes, so the last 10 come from whatever RAM follows the compiler in memory (the power-up pattern 00 00 00 FF FF FF FF
00 00 00 in the emulator, undefined on real hardware).  Those 10 bytes are
    $6C37-$6C3A  the last four entries (x=$41..$44) of the low-byte table of the extended-opcode dispatch:
                 $41 CIRCLE, $42 PAINT, $43 BOX, $44 (re-install trampolines)
    $6C3B-$6C40  the 5-byte floating-point constant PI (82 C9 0F DA A1) + 00 that the PI handler loads (image 1: $46AA-$46AF)
With the garbage, CIRCLE/PAINT/BOX call uninitialised RAM at $0142 and PI is nonsense.
THE FIX.  Append the missing 10 bytes: 38 03 91 71  82 C9 0F DA A1 00
    CIRCLE -> $4238, PAINT -> $4203, BOX -> $4291, $44 -> $4D71 (the high bytes are already in the file), PI as in image 1.

THE FAST/SLOW DEFECT (found 23.11.2026, both images).  xop2a_FAST / xop29_SLOW write $02 to the MMU configuration register $FF00
(I/O visible for $D011/$D030) and return to the main loop with `jmp skip2` without selecting configuration A ($FF01) again.  In
configuration $02 the BASIC ROM covers $8000-$BFFF and the KERNAL ROM $C000-$FFFF, so the next tokens are fetched from ROM when the
bytecode at that point lies above $8000 (programs with more than ~15 KB of bytecode); the next variable access (trampoline) would
restore configuration A, but until then the program misbehaves (seen: error 27, a missing POKE; perf/test/gen_fast8000.py).
All other 19 handlers that write $FF00 restore configuration A before they return (audit, see perf/RUNTIME_PERF.md).
THE FIX.  The `jmp skip2` operand is pointed at the existing tail `sta $ff01 : jmp next_y0` of SPRCOLOR (next_y0 = skip2 with
prevop = 0, which holds at statement level anyway).  No new bytes: image 1 $3DC2: E7 27 -> F4 3D, image 2 $6353: 78 4D -> 85 63.
The compiler runs on image 1 itself, so it gets the fix too.

The version string shown in the title ("V860929") is replaced by V<yymmdd>.  Compiled programs must be recompiled."""
import sys, os, time, hashlib
H = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', '..', 'blitz!.128.prg')
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(H, '..', '..', 'fixed', 'blitz!.128.prg')
ver = sys.argv[3] if len(sys.argv) > 3 else time.strftime('%y%m%d')
assert len(ver) == 6 and ver.isdigit(), 'version must be yymmdd'
d = bytearray(open(src, 'rb').read())
assert len(d) == 45212 and hashlib.sha1(d).hexdigest() == 'de85d69906c2d9fba070a5ceaa30013bb00641f9', \
    'input is not the untouched BLITZ!.128 (V860929) of this repository'
IMG2 = 2 + (0xa065 - 0x1c01)                         # file offset of the $4001 image
assert len(d) - IMG2 == 0x6c37 - 0x4001, 'image 2 is expected to end at $6C36'
d += bytes([0x38, 0x03, 0x91, 0x71,  0x82, 0xc9, 0x0f, 0xda, 0xa1, 0x00])
# FAST/SLOW: jmp skip2 -> jmp (sta $ff01 : jmp next_y0)
for addr, old, new in ((0x3dc2, b'\xe7\x27', b'\xf4\x3d'), (0x6353, b'\x78\x4d', b'\x85\x63')):
    off = 2 + addr - 0x1c01 if addr < 0x4001 else IMG2 + addr - 0x4001
    assert d[off:off + 2] == old and d[off - 1] == 0x4c, 'FAST/SLOW patch site $%04X' % addr
    d[off:off + 2] = new
VER = 0x7e25                                         # "860929" XOR $3E in the title string
assert bytes(c ^ 0x3e for c in d[VER:VER + 6]) == b'860929'
d[VER:VER + 6] = bytes(ord(c) ^ 0x3e for c in ver)
open(dst, 'wb').write(d)
print('wrote', dst, len(d), 'bytes, version V' + ver, 'sha1', hashlib.sha1(d).hexdigest())
