// runtime2026/test/mathcheck.mjs [count]  -- bit-exactness of the FASTMATH routines against the C128 BASIC ROM.
// A 6502 core (blitzc/js/cpu6502.js) with a small C128 memory map: RAM bank 0/1, BASIC lo/hi + KERNAL ROM, the MMU configuration
// register $FF00 and the pre-configurations $FF01-$FF04 (A=$3F all RAM, B=$7F bank 1, C=$01 ROMs, D=$41).  Low RAM $0000-$0FFF is a
// dump taken in VICE at the END of a compiled program (trampolines at $0202, BASIC RAM routines at $0380-$03FF).
// The FASTMATH extension block of image 1 (blitzc/js/rt2026img.js) is loaded at $46B0 and fm_init builds the tables.
// Every case runs once in the ROM (config C) and once in the copy (config A); FAC, ARG, the window $28-$2B and an error stop must agree.
import { readFileSync } from 'node:fs';
import { CPU6502 } from '../../blitzc/js/cpu6502.js';
import { RT2026 } from '../../blitzc/js/rt2026img.js';
const here = new URL('.', import.meta.url).pathname;
const romdir = process.env.C128ROMS || (process.env.HOME + '/.local/share/vice/C128/');
const LO = readFileSync(romdir + 'basiclo-318018-04.bin'), HI = readFileSync(romdir + 'basichi-318019-04.bin'), KR = readFileSync(romdir + 'kernal-318020-05.bin');
const V = RT2026.fastmath[1], L = V.labels;
const ram0 = new Uint8Array(0x10000), ram1 = new Uint8Array(0x10000);
ram0.set(readFileSync(here + 'ram0.bin').subarray(2), 0);
ram0.set(readFileSync(here + '../../fixed/blitz!.128.prg').subarray(2, 2 + 0x46b0 - 0x1c01), 0x1c01);   // runtime image 1 (rom_call_x ...)
const ext = Uint8Array.from(Buffer.from(V.ext, 'base64')); ram0.set(ext, V.extAt);
const PRE = [0x3f, 0x7f, 0x01, 0x41];
let cr = 0x3f;
const rd = a => {
  if (a >= 0xff00 && a <= 0xff04) return a === 0xff00 ? cr : PRE[a - 0xff01];
  if (a >= 0x4000 && a < 0x8000 && !(cr & 2)) return LO[a - 0x4000];
  if (a >= 0x8000 && a < 0xc000 && !(cr & 0x0c)) return HI[a - 0x8000];
  if (a >= 0xc000 && !(cr & 0x30)) { if (a >= 0xd000 && a < 0xe000 && !(cr & 1)) return 0; return KR[a - 0xc000]; }
  return (cr & 0x40) && a >= 0x400 ? ram1[a] : ram0[a];
};
const wr = (a, v) => {
  if (a === 0xff00) { cr = v; return; }
  if (a > 0xff00 && a <= 0xff04) { cr = PRE[a - 0xff01]; return; }
  if (a >= 0xd000 && a < 0xe000 && !(cr & 1)) return;   // I/O
  ((cr & 0x40) && a >= 0x400 ? ram1 : ram0)[a] = v;
};
const cpu = new CPU6502(rd, wr);
// run a subroutine; stop at the RTS to $FFFE or at the BASIC error entry $4D3C (ROM)
function call(addr, a, config) {
  cr = config; cpu.s = 0xf0; cpu.a = a; cpu.x = cpu.y = 0; cpu.p = 0x24; cpu.nz(a);
  cpu.push(0xff); cpu.push(0xfd); cpu.pc = addr;
  const trail = [];
  for (let n = 0; n < 5e6; n++) {
    if (cpu.pc === 0xfffe) return 'ok';
    if (cpu.pc === 0x4d3c && !(cr & 2)) return 'error ' + cpu.x;
    trail.push(cpu.pc.toString(16) + '/' + cr.toString(16)); if (trail.length > 24) trail.shift();
    try { cpu.step(); } catch (e) { return 'crash ' + e.message + ' trail ' + trail.join(' '); }
  }
  return 'step limit at ' + addr.toString(16);
}
// fm_init: shadow header word 2 = end of program ($6000 -> tables $6000-$67FF)
ram0[V.extAt + 2] = 0x00 ^ 0x97; ram0[V.extAt + 3] = 0x60 ^ 0x97;
if (call(L.fm_init, 0, 0x3f) !== 'ok') throw new Error('fm_init');
const f = x => Math.floor(x * x / 4);
for (let x = 0; x < 512; x++) {
  const s1 = ram0[0x6000 + x] | ram0[0x6200 + x] << 8, s2 = ram0[0x6400 + x] | ram0[0x6600 + x] << 8;
  if (s1 !== f(x) || s2 !== f(x - 255)) throw new Error(`table ${x}: ${s1} ${s2}`);
}
console.log('fm_init: tables ok');

let seed = +process.env.SEED || 4711;
// xorshift32 (an LCG with seed*1103515245 loses precision in JS doubles and falls into a short cycle)
const R = n => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed % n; };
const byte = () => { const k = R(8); return k === 0 ? 0 : k === 1 ? 255 : R(256); };   // zero bytes are common in real numbers
const ZP = [0x28, 0x29, 0x2a, 0x2b, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71];
function setFac(e, m, s, ov) { ram0[0x63] = e; for (let i = 0; i < 4; i++) ram0[0x64 + i] = m[i]; ram0[0x68] = s; ram0[0x71] = ov; }
function setArg(e, m, s) { ram0[0x6a] = e; for (let i = 0; i < 4; i++) ram0[0x6b + i] = m[i]; ram0[0x6f] = s; ram0[0x70] = s ^ ram0[0x68]; }
const snap = () => ZP.map(a => ram0[a]);
let bad = 0, n = 0, errs = 0;
function compare(what, rom, mine, input) {
  n++;
  if (rom.r === 'ok' || mine.r === 'ok') { if (rom.r !== mine.r || rom.z.some((v, i) => v !== mine.z[i])) report(); }
  else if (rom.r !== mine.r) report(); else errs++;
  function report() {
    bad++;
    if (bad <= 15) console.log('MISMATCH', what, input, '\n  rom ', rom.r, rom.z.map(h).join(' '), '\n  mine', mine.r, mine.z.map(h).join(' '));
  }
}
const h = v => v.toString(16).padStart(2, '0');
const N = +process.argv[2] || 200000;
const ONLY = process.env.ONLY;   // ONLY=FMULT|SQR|LOG|EXP|COS|SIN|TAN|ATN|FPWR: run only that part (same cases as in a full run only for FMULT)
// ---- FMULTT: fixed edge cases (overflow, underflow, zero, exponent result 0), then random ones
for (const [fe, ae] of [[0xf0, 0xf0], [0xc0, 0xc1], [0xff, 0x81], [0x81, 0xff], [0x40, 0x40], [0x01, 0x7f], [0x80, 0x80], [0x00, 0x90], [0x90, 0x00], [0xc0, 0xc0]]) {
  const res = [[0x8a27, 0x01], [L.fast_fmultt, 0x3f]].map(([addr, cfg]) => {
    setFac(fe, [0xc0, 0, 0, 0], 0, 0); setArg(ae, [0x80, 0, 0, 0], 0); ram0[0x3df] = 0;
    return { r: call(addr, fe, cfg), z: snap() };
  });
  compare('FMULT edge', res[0], res[1], [fe, ae]);
  console.log('  edge', fe.toString(16), ae.toString(16), 'rom', res[0].r, res[0].z[4].toString(16), 'mine', res[1].r, res[1].z[4].toString(16));
}
for (let i = 0; i < (ONLY && ONLY !== 'FMULT' ? 0 : N); i++) {
  const fe = R(10) === 0 ? 0 : R(256), ae = R(10) === 0 ? 0 : R(256);
  const fm = [byte() | 0x80, byte(), byte(), byte()], am = [byte() | 0x80, byte(), byte(), byte()];
  const fs = R(2) ? 0xff : 0, as = R(2) ? 0xff : 0, ov = byte(), b3df = R(4) ? 0 : R(256);
  const run = (addr, config) => {
    setFac(fe, fm, fs, ov); setArg(ae, am, as); ram0[0x3df] = b3df; ram0[0x28] = ram0[0x29] = ram0[0x2a] = ram0[0x2b] = 0x55;
    const r = call(addr, fe, config); return { r, z: snap() };
  };
  compare('FMULT', run(0x8a27, 0x01), run(L.fast_fmultt, 0x3f), { fe, fm, fs, ov, ae, am, as, b3df });
}
console.log(`FMULT: ${n} cases, ${errs} errors in both, ${bad} mismatches`);
// ---- functions: random float arguments (FAC), ROM entry vs copy
const toFac = x => {
  if (x === 0) return [0, [0, 0, 0, 0], 0];
  const s = x < 0 ? 0xff : 0; x = Math.abs(x);
  let e = Math.floor(Math.log2(x)) + 1, m = x / 2 ** e;
  if (m < 0.5) { m *= 2; e--; } if (m >= 1) { m /= 2; e++; }
  let q = Math.floor(m * 2 ** 32); if (q >= 2 ** 32) q = 2 ** 32 - 1;
  return [e + 128, [q >>> 24, (q >>> 16) & 255, (q >>> 8) & 255, q & 255], s];
};
const FN = { SQR: [0x8fb7, 'm_8FB7'], LOG: [0x89ca, 'm_89CA'], EXP: [0x9033, 'm_9033'], COS: [0x9409, 'm_9409'],
             SIN: [0x9410, 'm_9410'], TAN: [0x9459, 'm_9459'], ATN: [0x94b3, 'm_94B3'] };
const M = Math.max(1000, (N / 10) | 0);
for (const [name, [romA, lab]] of Object.entries(FN)) {
  if (ONLY && ONLY !== name) continue;
  bad = n = errs = 0;
  for (let i = 0; i < M; i++) {
    const k = R(4);
    let x = k === 0 ? (R(2001) - 1000) / 7 : k === 1 ? (R(100000) - 50000) * 1e-3 : k === 2 ? Math.exp((R(2000) - 1000) / 40) * (R(2) ? 1 : -1) : R(64) - 32;
    if ((name === 'SQR' || name === 'LOG') && R(5)) x = Math.abs(x);   // mostly valid arguments
    const [e, m, s] = toFac(x); const ov = R(3) ? 0 : byte();
    const run = (addr, config) => { setFac(e, m, s, ov); ram0[0x3df] = 0; const r = call(addr, e, config); return { r, z: snap().slice(4, 10).concat([ram0[0x71]]) }; };
    compare(name, run(romA, 0x01), run(L[lab], 0x3f), x);
  }
  console.log(`${name}: ${n} cases, ${errs} errors in both, ${bad} mismatches`);
}
// ---- FPWR (a^b): ARG = a, FAC = b
bad = n = errs = 0;
for (let i = 0; i < (ONLY && ONLY !== 'FPWR' ? 0 : M); i++) {
  const a = R(3) ? (R(20000) - 2000) / 100 : R(20) - 5, b = R(2) ? (R(800) - 400) / 50 : R(12) - 4;
  const [ae, am, as] = toFac(a), [be, bm, bs] = toFac(b);
  const run = (addr, config) => { setFac(be, bm, bs, 0); setArg(ae, am.map((v, j) => j ? v : v | 0x80), as); const r = call(addr, be, config); return { r, z: snap().slice(4, 10).concat([ram0[0x71]]) }; };
  compare('FPWR', run(0x8fc1, 0x01), run(L.m_8FC1, 0x3f), [a, b]);
}
console.log(`FPWR: ${n} cases, ${errs} errors in both, ${bad} mismatches`);
