#!/usr/bin/env python3
"""Build a C128 boot program: load a BASIC extension, activate it with SYS, then load and RUN a program.

usage: mkboot.py out.prg --ext GUIT --sys 7181 --prog C-POWERCOMP2 [--ext2 NAME --sys2 ADDR]

The boot file loads at $1C01 (BASIC stub "10 SYS7181"), copies its loader to $1300 and runs it there,
because the extension itself usually loads to $1C01. Loader steps (kernal, current device $BA):
  1. LOAD "<ext>" to its own address (SA=1), JSR <sys>     (repeat for --ext2)
  2. LOAD "<prog>" to its own address (SA=1), store end in $1210/$1211 (BASIC text end)
  3. put "RUN"+CR into the keyboard buffer, JMP $4003 (BASIC warm start)
A compiled Blitz program at $4001 then starts with its loader seeing BASIC start = $4001.
Names are given in ASCII and written as PETSCII (upper case = unshifted letters)."""
import argparse

def petscii(s): return bytes(ord(c) for c in s.upper())

def assemble(steps, prog):
    code = bytearray(); base = 0x1300; fix = []           # (pos, label)
    def emit(*b): code.extend(b)
    def jsr(a): emit(0x20, a & 255, a >> 8)
    names = []
    def name_ref(n):
        names.append(n); idx = len(names) - 1
        emit(0xa9, len(n)); emit(0xa2, 0); fix.append((len(code) - 1, ('lo', idx))); emit(0xa0, 0); fix.append((len(code) - 1, ('hi', idx)))
        jsr(0xffbd)                                    # SETNAM
    def load(n):
        emit(0xa9, 0x00, 0xa2, 0x00); jsr(0xff68)      # SETBNK load bank 0, name bank 0
        name_ref(n)
        emit(0xa6, 0xba, 0xd0, 0x02, 0xa2, 0x08)       # LDX $BA; BNE +2; LDX #8 (no device yet -> 8)
        emit(0xa9, 0x01, 0xa0, 0x01); jsr(0xffba)      # SETLFS 1,X,1 (load to the file's own address)
        emit(0xa9, 0x00); jsr(0xffd5)                  # LOAD
        emit(0xb0, 0x00); fix.append((len(code) - 1, ('err',)))  # BCS err
    for n, sysaddr in steps:
        load(n); jsr(sysaddr)
    load(prog)
    emit(0x8e, 0x10, 0x12, 0x8c, 0x11, 0x12)          # STX $1210; STY $1211 (end of BASIC text)
    emit(0xa2, 0x03)                                   # LDX #3
    loop = len(code)
    emit(0xbd, 0, 0); fix.append((len(code) - 2, ('runtxt',)))   # LDA runtxt,X
    emit(0x9d, 0x4a, 0x03, 0xca, 0x10, (loop - (len(code) + 6)) & 255)   # STA $034A,X; DEX; BPL loop (6 bytes)
    emit(0xa9, 0x04, 0x85, 0xd0)                       # 4 chars in keyboard buffer
    err = len(code)
    emit(0x4c, 0x03, 0x40)                             # JMP $4003 (BASIC warm start)
    runtxt = len(code); code.extend(b'RUN\r')
    npos = []
    for n in names: npos.append(len(code)); code.extend(petscii(n))
    for pos, lab in fix:
        if lab[0] == 'lo': code[pos] = (base + npos[lab[1]]) & 255
        elif lab[0] == 'hi': code[pos] = (base + npos[lab[1]]) >> 8
        elif lab[0] == 'err': code[pos] = (err - (pos + 1)) & 255
        elif lab[0] == 'runtxt': a = base + runtxt; code[pos] = a & 255; code[pos + 1] = a >> 8
    return bytes(code)

def build(steps, prog):
    ml = assemble(steps, prog)
    assert len(ml) <= 255, 'loader too long'
    stub = bytes([0x0b, 0x1c, 0x0a, 0x00, 0x9e]) + b'7181' + bytes([0, 0, 0])   # 10 SYS7181 -> $1C0D
    mlsrc = 0x1c0d + 19
    cp = bytes([0xa2, len(ml),                                # LDX #len
                0xbd, (mlsrc - 1) & 255, (mlsrc - 1) >> 8,    # LDA mlsrc-1,X
                0x9d, 0xff, 0x12,                             # STA $12FF,X
                0xca, 0xd0, 0xf7,                             # DEX; BNE
                0xa9, 0x00, 0x8d, 0x00, 0xff,                 # LDA #0; STA $FF00 (system bank, ROMs on)
                0x4c, 0x00, 0x13])                            # JMP $1300
    assert len(cp) == 19
    return bytes([0x01, 0x1c]) + stub + cp + ml

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--ext', required=True); ap.add_argument('--sys', required=True, type=lambda x: int(x, 0))
    ap.add_argument('--ext2'); ap.add_argument('--sys2', type=lambda x: int(x, 0))
    ap.add_argument('--prog', required=True)
    a = ap.parse_args()
    steps = [(a.ext, a.sys)] + ([(a.ext2, a.sys2)] if a.ext2 else [])
    b = build(steps, a.prog)
    open(a.out, 'wb').write(b); print(a.out, len(b), 'bytes')
