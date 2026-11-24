#!/usr/bin/env python3
"""perf/mkimg.py <c.prg> <out.prg> <proto.s> [proto.s ...]  -- put a runtime prototype into an already compiled C/ file.

The prototype sources (perf/proto/*.s, ca65) are assembled against the symbols of analysis/runtime/runtime.s
(generated include perf/build/rtsyms.inc) and linked with perf/proto/blob.cfg at the first page boundary behind the program.
The blob is appended to the file (bank 0, behind the variable name table, which nothing else uses at run time).
Each prototype exports the entry points it replaces; PATCHES maps them to the runtime patch sites:
    hook_init        -> `jsr install_trampolines` in init ($222D) becomes `jsr hook_init`
    fast_<label>     -> the first 3 bytes of runtime label <label> become `jmp fast_<label>`
    stub_<label>     -> same, but through the stub (preferred when both exist; stubs restore MMU configuration A)
Only sites outside the encrypted patcher block $23D0-$2437 may be patched (the file holds it encrypted).
"""
import os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RT = os.path.join(HERE, '..', 'analysis', 'runtime', 'runtime.s')
BUILD = os.path.join(HERE, 'build')
LBL = os.path.join(BUILD, 'runtime.lbl')


def symbols():
    os.makedirs(BUILD, exist_ok=True)
    if not os.path.exists(LBL):
        o = os.path.join(BUILD, 'runtime.o')
        subprocess.check_call(['ca65', '-g', '-o', o, RT])
        subprocess.check_call(['ld65', '-C', os.path.join(os.path.dirname(RT), 'rt.cfg'), '-Ln', LBL,
                               '-o', os.path.join(BUILD, 'runtime.bin'), o])
    syms = {}
    for line in open(RT):
        m = re.match(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\$([0-9a-fA-F]+)', line)
        if m: syms[m.group(1)] = int(m.group(2), 16)
    for line in open(LBL):
        _, a, n = line.split()
        syms[n.lstrip('.')] = int(a, 16)
    with open(os.path.join(BUILD, 'rtsyms.inc'), 'w') as f:
        for n, a in sorted(syms.items()): f.write('%s = $%04X\n' % (n, a))
    return syms


def main():
    src, out, protos = sys.argv[1], sys.argv[2], sys.argv[3:]
    syms = symbols()
    data = bytearray(open(src, 'rb').read())
    assert data[0:2] == b'\x01\x1c', 'expects an image-1 C/ file (load address $1C01)'
    end = 0x1c01 + len(data) - 2
    blob_at = (end + 0xff) & 0xff00
    objs = []
    for p in protos:
        o = os.path.join(BUILD, os.path.basename(p)[:-2] + '.o')
        subprocess.check_call(['ca65', '-I', BUILD, '-o', o, p])
        objs.append(o)
    blob = os.path.join(BUILD, 'blob.bin')
    lbl = os.path.join(BUILD, 'blob.lbl')
    subprocess.check_call(['ld65', '-C', os.path.join(HERE, 'proto', 'blob.cfg'), '-D', '__BLOB__=$%04X' % blob_at,
                           '-Ln', lbl, '-o', blob] + objs)
    exports = {}
    for line in open(lbl):
        _, a, n = line.split()
        exports[n.lstrip('.')] = int(a, 16)

    def poke(addr, bs, expect=None):
        assert not (0x23d0 <= addr < 0x2438), 'patch site inside the encrypted patcher block: $%04X' % addr
        i = addr - 0x1c01 + 2
        if expect is not None:
            assert bytes(data[i:i + len(expect)]) == bytes(expect), 'unexpected bytes at $%04X: %s' % (addr, data[i:i + 4].hex())
        data[i:i + len(bs)] = bytes(bs)

    patched = []
    for n, a in sorted(exports.items()):
        if n == 'hook_init':
            it = syms['install_trampolines']
            poke(0x222d, [0x20, a & 0xff, a >> 8], [0x20, it & 0xff, it >> 8])
            patched.append('init: jsr %s' % n)
        elif n == 'fast_next_add':          # P3: NEXT's FADD call site
            poke(0x3637, [0x20, a & 0xff, a >> 8, 0x4c, 0x46, 0x36],
                 bytes.fromhex('a9488d8b02a288a56320b12320421e'))
            patched.append('NEXT $3637: jsr %s' % n)
        elif n.startswith('fast_') and 'stub_' + n[5:] in exports:
            pass                                 # reached through its stub
        elif (n.startswith('fast_') or n.startswith('stub_')) and n[5:] in syms:
            site = syms[n[5:]]
            poke(site, [0x4c, a & 0xff, a >> 8])
            patched.append('%s ($%04X) -> %s ($%04X)' % (n[5:], site, n, a))
    data += bytes(blob_at - end) + open(blob, 'rb').read()
    open(out, 'wb').write(data)
    print('%s: blob at $%04X, %d bytes; %s' % (out, blob_at, os.path.getsize(blob), '; '.join(patched)))


if __name__ == '__main__':
    main()
