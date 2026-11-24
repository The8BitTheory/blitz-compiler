#!/usr/bin/env python3
"""perf/profile.py <c.prg> [<c.prg> ...]  -- cycle profile of a compiled Blitz!128 program (image 1 runtime).

Runs the program twice in headless x128 (via run_bench.sh): run 1 = `prof flat` to learn the profiled functions,
run 2 = `prof disass` for every function (per-instruction cycles). The cycles are then attributed to runtime routines
(labels of analysis/runtime/runtime.s, local `_n` labels rolled up into their parent) and summed into classes.
Output: one table per program plus <c>.profile.txt with the per-routine list.
"""
import os, re, subprocess, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
RTDIR = os.path.join(HERE, '..', 'analysis', 'runtime')
LBL = os.environ.get('LBL', os.path.join(HERE, 'build', 'runtime.lbl'))

TRAMP = {0x0202: 'tr_cfgA_jmp', 0x0208: 'tr_call_vec', 0x020e: 'ld_var', 0x021d: 'st_var', 0x022c: 'rd_zp_set',
         0x022f: 'rd_zp', 0x0238: 'blkcpy_b', 0x024d: 'cmp_b', 0x025e: 'wr_zp_set', 0x0261: 'wr_zp',
         0x026a: 'tr_call_user', 0x0270: 'tr_user_ret', 0x0276: 'print_str', 0x0287: 'rom_call', 0x0291: 'str_copy_b'}

# class of a routine (first matching prefix wins); everything else in the runtime = 'handlers (other)'
CLASSES = [
    ('dispatch',          ('next', 'skip', 'fetch', 'main_op', 'ext_op', 'set_bcptr', 'bc_jump', 'operand_push',
                           'push_left', 'push_narrow', 'push_float', 'push_int', 'var_long_or_const')),
    ('variable access',   ('var_load', 'var_store', 'operand_load', 'operand_const', 'const_small', 'var_long_ref')),
    ('bank-1 trampolines', ('ld_var', 'st_var', 'rd_zp', 'rd_zp_set', 'wr_zp', 'wr_zp_set', 'blkcpy_b', 'cmp_b',
                            'str_copy_b', 'print_str', 'tr_')),
    ('operators',         ('binop', 'icmp', 'int_', 'right_', 'bitop', 'str_compare', 'str_concat', 'neg_int')),
    ('ROM call gateway',  ('rom_call',)),
]


def labels():
    if not os.path.exists(LBL):
        os.makedirs(os.path.dirname(LBL), exist_ok=True)
        o = LBL[:-4] + '.o'
        subprocess.check_call(['ca65', '-g', '-o', o, os.path.join(RTDIR, 'runtime.s')])
        subprocess.check_call(['ld65', '-C', os.path.join(RTDIR, 'rt.cfg'), '-Ln', LBL, '-o', LBL[:-4] + '.bin', o])
    lab = {}
    for line in open(LBL):
        _, a, n = line.split()
        lab[int(a, 16)] = n.lstrip('.')
    for a, n in TRAMP.items():
        lab[a] = n
    return sorted(lab.items())


def routine_of(addr, cfg, labs):
    if 0x0202 <= addr < 0x02a2:
        best = max((a for a in TRAMP if a <= addr))
        return TRAMP[best]
    if cfg == 'ram' and not (0x1c01 <= addr < 0x46b0):
        return 'prototype $%04X' % (addr & 0xfff0) if addr >= 0x46b0 else 'other $%04X' % addr
    if cfg == 'ram':
        best = None
        for a, n in labs:
            if a <= addr: best = n
            else: break
        return re.sub(r'_\d+$', '', best) if best else '?'
    if 0xff00 <= addr: return 'KERNAL $%04X' % addr
    if 0xc000 <= addr: return 'KERNAL/editor'
    if 0x4000 <= addr < 0xc000: return 'BASIC ROM'
    return 'other $%04X' % addr


def class_of(r):
    if r in ('BASIC ROM',) or r.startswith('KERNAL') or r.startswith('other'): return 'ROM / IRQ'
    if r.startswith('prototype'): return 'prototype code'
    for c, prefixes in CLASSES:
        if any(r == p or r.startswith(p) for p in prefixes): return c
    return 'handlers (other)'


def run(prg, extra):
    env = dict(os.environ, PROF='1', PROFN='400', PROFX=extra)
    subprocess.run([os.path.join(HERE, 'run_bench.sh'), prg], env=env, check=True)
    return open(prg[:-4] + '.mon.log', encoding='latin-1').read()


def parse_disass(log):
    """-> list of (function, cfg, [(addr, cycles)]); cfg 'ram' if the banking config shows RAM in bank 0 (config A)."""
    out = []
    for sec in re.split(r'\nFunction ', log)[1:]:
        fn = int(sec.split()[0], 16)
        m = re.search(r'Memory Banking Config: (\d+)', sec)
        cfg = m.group(1) if m else '?'
        rows = [(int(a, 16), int(c)) for c, a in re.findall(r'^\s+(\d+)\s+[\d.]+%\s+\d+ .*?\.C:([0-9a-f]{4})', sec, re.M)]
        out.append((fn, cfg, rows))
    return out


def main():
    labs = labels()
    for prg in sys.argv[1:]:
        log1 = run(prg, '')
        sw = int(re.search(r'Stopwatch:\s+(\d+)', log1).group(1))
        flat = re.findall(r'^\s+(\d+)\s+[\d.]+%\s+(\d+)\s+[\d.]+% ([0-9a-f]{4}|ROOT)', log1, re.M)
        funcs = [f for _, _, f in flat if f != 'ROOT']
        script = prg[:-4] + '.prof.mon'
        with open(script, 'w') as f:
            for fn in funcs: f.write('prof disass %s\n' % fn)
            f.write('quit\n')
        log2 = run(prg, 'playback \\"%s\\"' % os.path.abspath(script))
        secs = parse_disass(log2)
        # ROM configurations = those seen in functions that live in the BASIC-hi/KERNAL ROM area; everything else is RAM
        romcfgs = {cfg for fn, cfg, _ in secs if 0x8000 <= fn < 0xfc00}
        per = collections.Counter()
        for fn, cfg, rows in secs:
            kind = 'rom' if cfg in romcfgs else 'ram'
            for a, c in rows:
                per[routine_of(a, kind, labs)] += c
        total = sum(per.values())
        cls = collections.Counter()
        for r, c in per.items(): cls[class_of(r)] += c
        name = os.path.basename(os.path.dirname(prg)) or prg
        with open(prg[:-4] + '.profile.txt', 'w') as f:
            f.write('%s: stopwatch %d cycles, profiled %d\n' % (name, sw, total))
            for r, c in per.most_common(): f.write('%10d %5.1f%%  %s  [%s]\n' % (c, 100.0 * c / total, r, class_of(r)))
        root = int(re.search(r'^\s+(\d+)\s+[\d.]+%\s+\d+\s+[\d.]+% ROOT', log1, re.M).group(1))
        print('%s: %d cycles (profiled %d of %d)' % (name, sw, total, root))
        for c, n in cls.most_common(): print('   %-20s %5.1f%%' % (c, 100.0 * n / total))
        print('   top routines: ' + ', '.join('%s %.1f%%' % (r, 100.0 * c / total) for r, c in per.most_common(8)))


if __name__ == '__main__':
    main()
