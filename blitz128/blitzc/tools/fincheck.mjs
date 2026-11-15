// Compare js/cbmfloat.js (pure JS) with the original FIN run on the 6502 core + C128 BASIC ROM.
// usage: node tools/fincheck.mjs [count]
import { readFileSync } from 'node:fs';
import { Runtime } from '../js/rt.js';
import { finVal, OverflowError } from '../js/cbmfloat.js';
import { findBasicRom } from '../js/rom.js';
import { mflpt } from '../js/rt.js';
import { CPU6502 } from '../js/cpu6502.js';
const here = new URL('..', import.meta.url).pathname;
const rom = findBasicRom(); if (!rom) { console.log('need the ROM as reference'); process.exit(2); }
const rt = new Runtime(readFileSync(here + '../blitz!.128.prg'));
rt.basicRom = rom;
// reference: the original FIN ($4314) on a 6502 core, BASIC-hi ROM at $8000-$BFFF (MMU config $02)
rt.fin6502 = function (len) {
  if (!this.cpu) {
    const ram = this.ram6502 = new Uint8Array(this.mem);
    ram.copyWithin(0x0202, 0x1c5e, 0x1c5e + 0xa0);           // bank trampolines, as copied at startup
    this.cpu = new CPU6502(a => (a >= 0x8000 && a < 0xc000 ? rom[a - 0x8000] : ram[a]),
      (a, v) => { if ((a < 0x8000 || a >= 0xc000) && !(a >= 0xff00 && a <= 0xff04)) ram[a] = v; });
  }
  const ram = this.ram6502;
  ram.set(this.mem.subarray(0x1d00, 0x1da0), 0x1d00);
  const c = this.cpu; c.s = 0xff; c.p = 0x24; c.a = len & 255; c.x = c.y = 0;
  c.call(0x4314);
  if (ram[0x10] & 0x80) { const v = ram[0x66] << 8 | ram[0x67]; return v & 0x8000 ? v - 0x10000 : v; }
  const e = ram[0x63]; if (!e) return 0;
  let m = ram[0x64] * 2 ** 24 + ram[0x65] * 65536 + ram[0x66] * 256 + ram[0x67], ex = e;
  if (ram[0x71] & 0x80) { m += 1; if (m === 2 ** 32) { m = 2 ** 31; ex++; } }   // MOVMF rounding
  const r = m * Math.pow(2, ex - 128 - 32);
  return (ram[0x68] & 0x80) ? -r : r;
};
const ref = s => { for (let k = 0; k < s.length; k++) rt.mem[0x1d00 + k] = s.charCodeAt(k); return rt.fin6502(s.length); };
const N = +process.argv[2] || 100000;
let seed = 12345; const R = n => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
const gen = () => {
  const k = R(10);
  let m = ''; const nd = 1 + R(k < 3 ? 5 : 18); for (let i = 0; i < nd; i++) m += R(10);
  if (R(3) === 0) m = m.replace(/^0+/, '') || '0';
  let s = m;
  if (R(2)) { const d = R(m.length + 1); s = m.slice(0, d) + '.' + m.slice(d); }
  if (R(3) === 0) s += 'E' + (R(2) ? '-' : (R(4) ? '' : '+')) + R(45);
  if (R(10) === 0) s = '-' + s;
  if (R(20) === 0) s = s.replace(/(\d)/, '$1 ');
  return s;
};
const fixed = ['0', '1', '9', '10', '3071', '3072', '30719', '30720', '32767', '32768', '65535', '99999', '.5', '0.1', '3.14159',
  '3.14159265358979', '123456789.123', '1E38', '1.70141183E38', '2.9E-39', '1E-38', '4E-39', '.', '..5', '1..5', '1.2.3', 'E5', '1E', '1E-',
  '00000000000001', '1.0000000001', '9999999999', '4294967295', '4294967296', '0.000000000001', '1E+10', ' 12 ', '1 2 3.4 5'];
let bad = 0, n = 0, ovf = 0;
const hex = v => mflpt(v).map(b => b.toString(16).padStart(2, '0')).join('');
for (let i = 0; i < N + fixed.length; i++) {
  const s = i < fixed.length ? fixed[i] : gen();
  let a, b, ea, eb;
  try { a = ref(s); } catch (e) { ea = 1; rt.cpu = null; ref('0'); }
  try { b = finVal(s); } catch (e) { eb = 1; if (!(e instanceof OverflowError)) throw e; }
  n++;
  if (ea || eb) { if (!(ea && eb)) { bad++; if (bad < 20) console.log('overflow mismatch', JSON.stringify(s), ea, eb); } else ovf++; continue; }
  if (hex(a) !== hex(b) || Object.is(a, -0) !== Object.is(b, -0) || a !== b) { bad++; if (bad < 20) console.log('MISMATCH', JSON.stringify(s), a, b, hex(a), hex(b)); }
}
console.log(`${n} strings, ${ovf} overflow in both, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
