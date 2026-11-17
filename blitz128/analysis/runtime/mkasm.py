#!/usr/bin/env python3
"""Generate the annotated, re-assemblable ca65 source of the Blitz!128 runtime
(image 1, load $1C01) from ../run_1c01.bin (the runtime as executed).

  python3 mkasm.py            -> runtime.s
  make check                  -> assemble runtime.s and compare byte-for-byte with run_1c01.bin

Names / comments live in names.py (edit that, not runtime.s)."""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
from dis6502 import decode
import names

IMG = 2 if '--img2' in sys.argv else 1
def sh(a):
    """image-1 address -> address in the selected image (image 2 = $4001 runtime with a 404-byte insertion at $1DA3)"""
    if IMG == 1 or not (0x1c01 <= a < 0x46b0): return a
    return a + (0x2400 if a < 0x1da3 else 0x2591)
if IMG == 1:
    BASE, END, IMGFILE, OUTFILE = 0x1c01, 0x46b0, 'run_1c01.bin', 'runtime.s'
else:
    BASE, END, IMGFILE, OUTFILE = 0x4001, 0x46b0 + 0x2591, 'run_4001.bin', 'runtime2.s'
img = open(os.path.join(HERE, '..', IMGFILE), 'rb').read()
M = img[2:2 + END - BASE]           # runtime proper
g = lambda a: M[a - BASE]
BR = ('BCC','BCS','BEQ','BNE','BMI','BPL','BVC','BVS')

def disasm(entries, lo, hi):
    code = {}; todo = list(entries)
    while todo:
        pc = todo.pop()
        while lo <= pc < hi and pc not in code:
            n, mn, mo, v, t, tg = decode(M, pc, BASE)
            if mn == '.byte': break
            code[pc] = (n, mn, mo, v, tg)
            if mn in ('JSR', 'JMP') and mo == 'abs' and lo <= tg < hi: todo.append(tg)
            if mo == 'rel' and lo <= tg < hi: todo.append(tg)
            if mn in ('JMP', 'RTS', 'RTI', 'BRK'): break
            pc += n
    return code

if IMG == 2:
    names.LABELS = {sh(a): n for a, n in names.LABELS.items()}
    names.COMMENT_BEFORE = {sh(a): t for a, t in names.COMMENT_BEFORE.items()}
    names.COMMENT = {sh(a): t for a, t in names.COMMENT.items()}
    names.REF_LABELS = [sh(a) for a in names.REF_LABELS]
    names.ERR_ENTRIES = {sh(a): v for a, v in names.ERR_ENTRIES.items()}
    names.SYMS = {(sh(a) if 0x1c01 <= a < 0x46b0 else a): n for a, n in names.SYMS.items()}
    names.ZP = dict(names.ZP)
    for _a in names.IMG2_DROP:
        names.LABELS.pop(_a, None); names.COMMENT_BEFORE.pop(_a, None)
    names.LABELS.update(names.IMG2_LABELS)
    names.COMMENT_BEFORE.update(names.IMG2_COMMENT_BEFORE)

# ---- entry points -------------------------------------------------------
main_tab_hi, main_tab_lo = sh(0x4443), sh(0x44b5)     # opcodes $0e..$7f
ext_tab_hi, ext_tab_lo = sh(0x45b8), sh(0x4665)       # extended opcodes $00 xx, xx = 0..$44
entries = [sh(0x1c2f), sh(0x2221)] + [sh(a) for a in names.EXTRA_CODE]
for x in range(0x0e, 0x80): entries.append(g(main_tab_lo + x) | g(main_tab_hi + x) << 8)
for x in range(0, 0x45):    entries.append(g(ext_tab_lo + x) | g(ext_tab_hi + x) << 8)
LO, HI = sh(0x1c2f), sh(0x4443)          # code lives here; tables from $4443 on
code = disasm([e for e in entries if LO <= e < HI], LO, HI)

# trampolines $1C5E..$1CFD are copied to $0202 at run time: shown as data (+ disassembly in comments)
TR_LO, TR_HI = sh(0x1c5e), sh(0x1cfe)
for a in [a for a in code if TR_LO <= a < TR_HI]: del code[a]
# $1D00..$1DA2: DOS status buffer / fill
for a in [a for a in code if sh(0x1d00) <= a < sh(0x1da3)]: del code[a]

# ---- data blocks (explicit layout, see names.DATA) ----------------------
data = {}   # start -> (kind, length)
for s, kind, ln in names.DATA: data[s] = (kind, ln)

# ---- labels --------------------------------------------------------------
labels = {}
for a, (n, mn, mo, v, tg) in code.items():
    if tg is not None and LO <= tg < END and (mn in ('JSR', 'JMP') or mo == 'rel') and mo != 'ind':
        labels.setdefault(tg, 'L%04x' % tg)
for e in entries:
    if LO <= e < END: labels.setdefault(e, 'L%04x' % e)
for s in data: labels.setdefault(s, 'D%04x' % s)
for a, nm in names.LABELS.items(): labels[a] = nm
_seen = {}
for x in range(0x0e, 0x80):
    a = g(main_tab_lo + x) | g(main_tab_hi + x) << 8
    nm = names.MAIN_OPS.get(x)
    if a in names.LABELS: continue
    if nm and a not in _seen: labels[a] = 'op%02x_%s' % (x, nm); _seen[a] = x
    elif a not in _seen and LO <= a < END: labels[a] = 'op%02x' % x; _seen[a] = x
for x in range(0, 0x45):
    a = g(ext_tab_lo + x) | g(ext_tab_hi + x) << 8
    if a in names.LABELS or a in _seen: continue
    nm = names.EXT_OPS.get(x)
    labels[a] = 'xop%02x_%s' % (x, nm) if nm else 'xop%02x' % x; _seen[a] = 0x100 + x
for a in names.REF_LABELS: labels.setdefault(a, 'L%04x' % a)
for i in range(0x0e, 0x80):   # handler names by opcode when otherwise anonymous
    a = g(main_tab_lo + i) | g(main_tab_hi + i) << 8
    if labels.get(a) == 'L%04x' % a and a in names.HANDLER_NAMES.get('main', {}).values(): pass

# addresses at which a line starts (labels inside an instruction cannot be defined)
starts = set(); _a = BASE
while _a < END:
    starts.add(_a)
    if _a in data: _a += data[_a][1]
    elif _a in code: _a += code[_a][0]
    else: _a += 1
# family comments by opcode -> address (above the first handler address with that opcode)
for x, txt in names.FAMILY_COMMENT.items():
    a = g(main_tab_lo + x) | g(main_tab_hi + x) << 8
    names.COMMENT_BEFORE.setdefault(a, txt)
# opcodes sharing one handler -> comment
_share = {}
for x in range(0x0e, 0x80):
    _share.setdefault(g(main_tab_lo + x) | g(main_tab_hi + x) << 8, []).append('$%02X %s' % (x, names.MAIN_OPS.get(x, '?')))
for x in range(0, 0x45):
    _share.setdefault(g(ext_tab_lo + x) | g(ext_tab_hi + x) << 8, []).append('$00,$%02X %s' % (x, names.EXT_OPS.get(x, '?')))
for a_, lst in _share.items():
    if len(lst) > 1 and a_ not in (sh(0x1da3), sh(0x2e95)):
        names.COMMENT_BEFORE[a_] = (names.COMMENT_BEFORE.get(a_, '') + '\n' if a_ in names.COMMENT_BEFORE else '') + 'shared by: ' + ', '.join(lst)
def sym(a):
    if a in names.SYMS: return names.SYMS[a]
    if a in labels and a in starts and LO <= a < END: return labels[a]
    return None

def operand(mn, mo, v, tg, pc=0):
    if mo == 'rel':
        s_ = sym(tg)
        return s_ if (s_ and tg not in names.SYMS) else '*%+d' % (tg - pc)
    if mo in ('abs', 'abx', 'aby', 'ind'):
        s = sym(v)
        if s is None: s = ('a:$%02x' if (v < 0x100 and mo != 'ind') else '$%04x') % v
        return {'abs': s, 'abx': s + ',x', 'aby': s + ',y', 'ind': '(' + s + ')'}[mo]
    if mo in ('zp', 'zpx', 'zpy'):
        s = names.ZP.get(v, '$%02x' % v)
        return {'zp': s, 'zpx': s + ',x', 'zpy': s + ',y'}[mo]
    if mo in ('izx', 'izy'):
        s = names.ZP.get(v, '$%02x' % v)
        return '(%s,x)' % s if mo == 'izx' else '(%s),y' % s
    if mo == 'imm': return '#$%02x' % v
    if mo == 'acc': return 'a'
    return ''

def bytes_line(a, b, per=16):
    return '        .byte %s' % ','.join('$%02x' % x for x in b)

out = []
w = out.append
w('; ============================================================================')
w('; Blitz!128 (Skyles) runtime  --  annotated, re-assemblable (ca65)')
w('; Generated by mkasm.py from run_1c01.bin; edit names.py, not this file.')
w(';   make check   verifies that this source reassembles to the original bytes.')
w('; Confidence tags:  [sure] verified in code/trace   [likely] derived from code   [open]')
w('; ============================================================================')
w('        .setcpu "6502"')
w('        .segment "RT"')
w('')
for a, nm in sorted(names.ZP.items()): w('%-12s = $%02x' % (nm, a)) if False else None
w('; --- zero page / system symbols ---')
for a, nm in sorted(names.ZP.items()): w('%-14s = $%02x' % (nm, a))
for a, nm in sorted(names.SYMS.items()):
    if a >= 0x100 and (not (BASE <= a < END) or a in names.ERR_ENTRIES): w('%-14s = $%04x' % (nm, a))
w('')

a = BASE
# BASIC stub + loader
def emit_data(a, ln, kind):
    b = M[a - BASE:a - BASE + ln]
    if kind == 'bytes':
        for i in range(0, ln, 16): w(bytes_line(a + i, b[i:i + 16]))
    elif kind == 'words':
        for i in range(0, ln, 8):
            w('        .word ' + ','.join('$%04x' % (b[j] | b[j + 1] << 8) for j in range(i, min(i + 8, ln), 2)))
    elif kind == 'text':     # screen-code-free ascii-ish
        for i in range(0, ln, 16): w(bytes_line(a + i, b[i:i + 16]))
    elif kind == 'tramp':
        # disassemble relocated to $0202 for comments
        for i in range(0, ln, 16): w(bytes_line(a + i, b[i:i + 16]))
    return a + ln

end = END
while a < end:
    if a in labels: w('%s:' % labels[a])
    if a in names.COMMENT_BEFORE:
        for line in names.COMMENT_BEFORE[a].split('\n'): w('; ' + line if line else ';')
    if a in data:
        kind, ln = data[a]
        # split data at any label inside
        cut = ln
        for x in range(a + 1, a + ln):
            if x in labels or x in names.COMMENT_BEFORE: cut = x - a; break
        emit_data(a, cut, kind); a += cut; continue
    if a in code:
        n, mn, mo, v, tg = code[a]
        op = operand(mn, mo, v, tg, a)
        cm = names.COMMENT.get(a)
        w('        %-4s %s%s' % (mn.lower(), op, ('%s; %s' % (' ' * max(1, 22 - len(op)), cm)) if cm else ''))
        a += n; continue
    # undecoded: byte run up to next label / code / data start
    e = a + 1
    while e < end and e not in code and e not in labels and e not in data and e not in names.COMMENT_BEFORE and e - a < 16: e += 1
    w(bytes_line(a, M[a - BASE:e - BASE])); a = e
w('')
open(os.path.join(HERE, OUTFILE), 'w').write('\n'.join(out) + '\n')
print(OUTFILE + ':', len(out), 'lines;', len(code), 'instructions')
