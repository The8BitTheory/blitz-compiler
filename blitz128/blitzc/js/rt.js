// Blitz!128 port: runtime environment for compiler.gen.js.
// Provides the BASIC primitives the compiled compiler uses, a small 1581
// simulation (channels, command channel, files), keyboard input, the memory
// cells the compiler PEEKs/POKEs, the DATA table and native versions of the
// compiler's machine-code helpers (SYS 288/291/5816/5872/5960/5985/6012).

import { CPU6502 } from './cpu6502.js';
const s16 = u => (u & 0x8000 ? (u & 0xffff) - 0x10000 : u & 0xffff);

// ---------- CBM number formatting / parsing
export function numStr(n) {               // like STR$: sign or blank, no trailing blank
  if (n === 0) return ' 0';
  const sg = n < 0 ? '-' : ' '; const a = Math.abs(n);
  if (Number.isInteger(a) && a < 1e9) return sg + a;
  let s;
  if (a >= 0.01 && a < 1e9) {
    s = a.toPrecision(9);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s.startsWith('0.')) s = s.slice(1);
  } else {
    let [m, e] = a.toExponential(8).split('e');
    m = m.replace(/0+$/, '').replace(/\.$/, '');
    const ei = parseInt(e, 10);
    s = m + 'E' + (ei < 0 ? '-' : '+') + String(Math.abs(ei)).padStart(2, '0');
  }
  return sg + s;
}
// ---------- CBM floating point, bit-exact where VAL needs it.
// FAC = { m: BigInt 32-bit normalized mantissa, e: exponent byte, ov: rounding byte }, value = m/2^32 * 2^(e-128)
const B32 = 1n << 32n, B31 = 1n << 31n;
function facRound(f) {              // ROUND / MOVAF / MOVMF: add 1 if rounding byte >= $80
  if (!f.m) return { m: 0n, e: 0, ov: 0 };
  let { m, e } = f;
  if (f.ov & 0x80) { m += 1n; if (m === B32) { m = B31; e++; } }
  return { m, e, ov: 0 };
}
function facFromBig(n) {            // exact integer -> FAC (n < 2^32 keeps all bits)
  if (n === 0n) return { m: 0n, e: 0, ov: 0 };
  let e = 128, m = n, ov = 0;
  while (m < B31) { m <<= 1n; e--; }
  while (m >= B32) { ov = Number(((m & 1n) << 7n)) | (ov >> 1); m >>= 1n; e++; }
  return { m, e: e + 32, ov };
}
function facAdd(x, y) {             // FADDT for two non-negative values: smaller operand shifted right, its bits form FACOV
  if (!x.m) return { ...y }; if (!y.m) return { ...x };
  if (y.e > x.e) [x, y] = [y, x];
  const d = x.e - y.e;
  const ys = (y.m << 8n) >> BigInt(d);           // 8 guard bits
  let s = (x.m << 8n) + ys, e = x.e;
  if (s >= (B32 << 8n)) { s >>= 1n; e++; }
  return { m: s >> 8n, e, ov: Number(s & 255n) };
}
function facMul10(f) {              // MUL10: ARG=round(FAC); FAC=ARG*4; FAC+=ARG; FAC*=2
  const a = facRound(f); if (!a.m) return a;
  const r = facAdd({ m: a.m, e: a.e + 2, ov: 0 }, a);
  return { m: r.m, e: r.e + 1, ov: r.ov };
}
function facDiv10(f) {              // DIV10: ARG=round(FAC); FAC=10; FDIVT -> 34 quotient bits, no sticky bit
  const a = facRound(f); if (!a.m) return a;
  const tm = 0xa0000000n, te = 132;              // 10.0
  const q = (a.m << 33n) / tm;
  if (q >= (1n << 33n)) return { m: q >> 2n, e: a.e - te + 129, ov: Number((q & 3n) << 6n) };
  return { m: q >> 1n, e: a.e - te + 128, ov: Number((q & 1n) << 7n) };
}
function facToNum(f) { return f.m ? Number(f.m) * Math.pow(2, f.e - 128 - 32) : 0; }
// FIN as called by VAL: digits accumulate with MUL10 + digit, then scaled by MUL10/DIV10.
export function cbmVal(s) {
  let i = 0; const n = s.length; const sk = () => { while (i < n && s[i] === ' ') i++; };
  sk(); let neg = false;
  if (s[i] === '-') { neg = true; i++; } else if (s[i] === '+') i++;
  let f = { m: 0n, e: 0, ov: 0 }, dexp = 0, dot = false, any = false;
  for (; i < n; i++) {
    const c = s[i];
    if (c === ' ') continue;
    if (c >= '0' && c <= '9') { f = facAdd(facMul10(f), facFromBig(BigInt(c.charCodeAt(0) - 48))); if (dot) dexp--; any = true; }
    else if (c === '.' && !dot) dot = true;
    else break;
  }
  if (!any) return 0;
  if (s[i] === 'E' || s[i] === 'e') {
    i++; sk(); let en = false, ev = 0;
    if (s[i] === '-') { en = true; i++; } else if (s[i] === '+') i++;
    for (; i < n; i++) { const c = s[i]; if (c === ' ') continue; if (c < '0' || c > '9') break; ev = ev * 10 + (c.charCodeAt(0) - 48); }
    dexp += en ? -ev : ev;
  }
  while (dexp > 0) { f = facMul10(f); dexp--; }
  while (dexp < 0) { f = facDiv10(f); dexp++; }
  const fr = facRound(f);
  if (fr.e <= 0) return 0;                       // underflow -> 0, as in the ROM
  const r = facToNum(fr);
  return neg ? -r : r;
}
// CBM 5-byte float (MFLPT)
export function mflpt(x) {
  if (x === 0) return [0, 0, 0, 0, 0];
  const sign = x < 0 ? 0x80 : 0; let a = Math.abs(x);
  let e = Math.floor(Math.log2(a)) + 1;
  let f = a / Math.pow(2, e);
  if (f >= 1) { f /= 2; e++; } if (f < 0.5) { f *= 2; e--; }
  let mant = Math.floor(f * 2 ** 32 + 0.5);
  if (mant >= 2 ** 32) { mant /= 2; e++; }
  return [e + 128, ((mant >>> 24) & 0x7f) | sign, (mant >>> 16) & 255, (mant >>> 8) & 255, mant & 255];
}

// ---------- the compiler's own runtime keys: decrypt the patcher block and apply it
// (port of tools/runimg.py; result = runtime image as it sits in memory while compiling)
function applyPatcher(mem, base, end) {
  const find = (sig, from = base) => {
    outer: for (let p = from; p < end - sig.length; p++) {
      for (let k = 0; k < sig.length; k++) if (mem[p + k] !== sig[k]) continue outer;
      return p;
    }
    return -1;
  };
  const dec = find([0xba, 0xbd, 0x02, 0x01, 0x85, 0x64, 0xbd, 0x01, 0x01, 0x85, 0x63, 0xa0]);
  if (dec < 0) throw new Error('runtime decryptor not found');
  const n = mem[dec + 12], tab = mem[dec + 16] | mem[dec + 17] << 8;
  const call = find([0x20, dec & 255, dec >> 8]); const ret = call + 2;
  const xorBlock = () => { for (let y = 1; y <= n; y++) mem[ret + y] ^= mem[tab + y]; };
  xorBlock();
  const s = ret + 1;
  let a = mem[s + 3]; const keytab = mem[s + 5] | mem[s + 6] << 8;
  const keys = []; for (let i = 0; i < 6; i++) { a ^= mem[keytab + i]; keys.push(a); }
  const K = {}; keys.forEach((k, i) => (K[0x6a + i] = k));
  let pc = s + 14, acc = keys[5], lim = null; const patches = [];
  for (;;) {
    const op = mem[pc];
    if (op === 0x8d) { const t = mem[pc + 1] | mem[pc + 2] << 8; patches.push([t, acc]); pc += 3; }
    else if (op === 0xa5 && mem[pc + 1] in K) { acc = K[mem[pc + 1]]; pc += 2; }
    else if (op === 0xa2) { lim = mem[pc + 1]; pc += 2; }
    else if (op === 0xa9) {
      let p = mem[pc + 1] | mem[pc + 5] << 8; const sigp = mem[pc + 0x1d] | mem[pc + 0x1e] << 8;
      const sg = [mem[sigp], mem[sigp + 1], mem[sigp + 2]]; const key = K[mem[pc + 0x0b]];
      for (;;) {
        patches.push([p + 3, key]);
        for (;;) { p++; if (p >> 8 === lim) break; if (mem[p] === sg[0] && mem[p + 1] === sg[1] && mem[p + 2] === sg[2]) break; }
        if (p >> 8 === lim) break;
      }
      pc += 0x26;
    } else break;
  }
  xorBlock();                       // block is re-encrypted (same bytes are live handler code)
  for (const [t, k] of patches) mem[t] = k;
  return { keys, patches: patches.length };
}

// ---------- the Runtime class
export class Runtime {
  constructor(blitz, opts = {}) {
    this.opts = opts;
    const la = blitz[0] | blitz[1] << 8;
    if (la !== 0x1c01) throw new Error('BLITZ!.128 must load at $1C01');
    const mem = this.mem = new Uint8Array(0x10000);
    mem.set(blitz.subarray(2), 0x1c01);
    const fend = 0x1c01 + blitz.length - 2;
    mem.set([0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0, 0, 0], fend);   // C128 RAM power-on pattern behind the file
    this.patch = applyPatcher(mem, 0x1c01, 0x46b0);
    // compiler header: keys + DATA table
    const H = 0x46b0; let a = 0x2f; const K = [];
    for (let i = 0; i < 6; i++) { a ^= mem[H + 12 + i]; K.push(a); }
    const w = (o, k) => (mem[o] ^ k) | (mem[o + 1] ^ k) << 8;
    const vt = w(H, 0x97), ve = w(H + 2, 0x97), dat = w(H + 8, 0x79);
    this.txtTop = ve;                                   // $1210/$1211 = end of the compiler program
    mem[0x1210] = ve & 255; mem[0x1211] = ve >> 8;
    this.VT = 0xf000; mem[47] = 0x00; mem[48] = 0xf0;   // fake variable table (only Z is ever PEEKed)
    this.data = [];
    for (let p = dat; ;) {
      const n = mem[p] ^ K[5]; if (n === 0xff) break;
      let t = ''; for (let k = 0; k < n; k++) t += String.fromCharCode(mem[p + 1 + k] ^ K[5]);
      this.data.push(t); p += n + 3;
    }
    this.dp = 0;
    // BASIC state
    this.v = {}; this.A = []; this.rs = []; this.fs = [];
    this.st = 0; this.steps = 0; this.maxSteps = opts.maxSteps || 5e8;
    // devices
    this.files = new Map(Object.entries(opts.files || {}).map(([k, b]) => [k, Array.from(b)]));
    this.ch = new Map(); this.inLfn = null; this.outLfn = null; this.fields = null;
    this.dstatus = '00, OK,00,00';
    this.keys = (opts.keys || '').split(''); this.lines = (opts.lines || []).slice();
    this.screen = ''; this.inputMode = false;
    this.rndq = opts.rnd ? opts.rnd.slice() : null;
    this.basicRom = opts.basicRom || null;   // optional C128 BASIC hi ROM (318019-04), for bit-exact float constants
  }
  init(VARS) { this.VARS = VARS; this.clr(); }
  clr() { for (const [, js, t] of this.VARS) this.v[js] = t === '$' ? '' : 0; }
  tick() { if (++this.steps > this.maxSteps) throw new Error('step limit'); }
  end() { this.closeAll(); return true; }

  // ---------- primitives
  T(x) { return x !== 0 && x !== ''; }
  toInt(x) {
    const r = Math.floor(x);
    if (!(r >= -32768 && r <= 32767)) throw new Error('?ILLEGAL QUANTITY (int ' + x + ')');
    return r;
  }
  int(x) { return Math.floor(x); }
  gt(a, b) { return a > b ? -1 : 0; } lt(a, b) { return a < b ? -1 : 0; }
  ge(a, b) { return a >= b ? -1 : 0; } le(a, b) { return a <= b ? -1 : 0; }
  eq(a, b) { return a === b ? -1 : 0; } ne(a, b) { return a !== b ? -1 : 0; }
  and(a, b) { return this.toInt(a) & this.toInt(b); }
  or(a, b) { return this.toInt(a) | this.toInt(b); }
  not(a) { return ~this.toInt(a); }
  pow(a, b) { return Math.pow(a, b); }
  sgn(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
  rnd() {
    if (this.rndq) { if (!this.rndq.length) throw new Error('RND queue exhausted'); return this.rndq.shift(); }
    return Math.random();
  }
  peek(a) {
    a = Math.floor(a) & 0xffff;
    if (a >= this.VT + 2 && a < this.VT + 7) return mflpt(this.v.Z_f)[a - this.VT - 2];
    return this.mem[a];
  }
  poke(a, x) { this.mem[Math.floor(a) & 0xffff] = Math.floor(x) & 255; }
  len(s) { return s.length; }
  str(n) { return numStr(n); }
  val(s) {
    // VAL handler ($2F85): copies the string to $1D00 (max 160 bytes, no terminator), then FIN ($4314)
    if (!s.length) return 0;
    const n = Math.min(s.length, 0xa0);
    for (let k = 0; k < n; k++) this.mem[0x1d00 + k] = s.charCodeAt(k);
    if (this.basicRom) { try { return this.fin6502(s.length); } catch (e) { this.cpu = null; } }
    return cbmVal(s);
  }
  fin6502(len) {
    // run the runtime's FIN with the C128 BASIC-hi ROM at $8000-$BFFF (MMU config $02)
    if (!this.cpu) {
      const ram = this.ram6502 = new Uint8Array(this.mem);
      ram.copyWithin(0x0202, 0x1c5e, 0x1c5e + 0xa0);           // bank trampolines, as copied at startup
      const rom = this.basicRom;
      this.cpu = new CPU6502(a => (a >= 0x8000 && a < 0xc000 ? rom[a - 0x8000] : ram[a]),
        (a, v) => { if ((a < 0x8000 || a >= 0xc000) && !(a >= 0xff00 && a <= 0xff04)) ram[a] = v; });
    }
    const ram = this.ram6502;
    ram.set(this.mem.subarray(0x1d00, 0x1da0), 0x1d00);
    const c = this.cpu; c.s = 0xff; c.p = 0x24; c.a = len & 255; c.x = c.y = 0;
    c.call(0x4314);
    if (ram[0x10] & 0x80) return s16(ram[0x66] << 8 | ram[0x67]);   // integer result in $66/$67
    const e = ram[0x63]; if (!e) return 0;
    let m = (ram[0x64] * 2 ** 24 + ram[0x65] * 65536 + ram[0x66] * 256 + ram[0x67]);
    let ex = e;
    if (ram[0x71] & 0x80) { m += 1; if (m === 2 ** 32) { m = 2 ** 31; ex++; } }   // MOVMF rounding
    const r = m * Math.pow(2, ex - 128 - 32);
    return (ram[0x68] & 0x80) ? -r : r;
  }
  asc(s) { return s.length ? s.charCodeAt(0) : 0; }
  chr(n) { return String.fromCharCode(Math.floor(n) & 255); }
  left(s, n) { return s.slice(0, Math.max(0, Math.floor(n))); }
  right(s, n) { n = Math.floor(n); return n <= 0 ? '' : s.slice(Math.max(0, s.length - n)); }
  mid(s, p, n) { p = Math.floor(p); return s.substr(p - 1, Math.max(0, Math.floor(n))); }
  dim(n, t) { return new Array(Math.floor(n) + 1).fill(t === '$' ? '' : 0); }
  aget(a, i) { i = Math.floor(i); if (!(i >= 0 && i < a.length)) throw new Error('?BAD SUBSCRIPT ' + i); return a[i]; }
  aset(a, i, x) { i = Math.floor(i); if (!(i >= 0 && i < a.length)) throw new Error('?BAD SUBSCRIPT ' + i); a[i] = x; }
  forPush(name, lim, pc) {
    const k = this.fs.findIndex(f => f.name === name); if (k >= 0) this.fs.length = k;
    this.fs.push({ name, lim, pc, int: name.endsWith('_i') });
  }
  next(v) {
    const f = this.fs[this.fs.length - 1]; if (!f) throw new Error('?NEXT WITHOUT FOR');
    v[f.name] = f.int ? this.toInt(v[f.name] + 1) : v[f.name] + 1;
    if (v[f.name] > f.lim) { this.fs.pop(); return null; }
    return f.pc;
  }
  restore() { this.dp = 0; }
  read(v, name, t) {
    if (this.dp >= this.data.length) throw new Error('?OUT OF DATA');
    const s = this.data[this.dp++]; v[name] = t === '$' ? s : t === '%' ? this.toInt(cbmVal(s)) : cbmVal(s);
  }
  tiS() { return '000000'; }
  setTi() {}

  // ---------- screen / channels
  toScreen(s) {
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      if (c === 13) this.screen += '\n';
      else if (c >= 0x41 && c <= 0x5a) this.screen += String.fromCharCode(c + 32);
      else if (c >= 0xc1 && c <= 0xda) this.screen += String.fromCharCode(c - 0x80);
      else if (c >= 32 && c < 127) this.screen += ch;
    }
  }
  fmt(x) { return typeof x === 'string' ? x : numStr(x) + ' '; }
  out(s) {
    if (this.outLfn === null) return this.toScreen(s);
    for (const ch of s) this.writeByte(this.outLfn, ch.charCodeAt(0));
  }
  pr(x) { this.out(this.fmt(x)); }
  prcr(x) { this.out(this.fmt(x) + '\r'); }
  spc(n) { this.out(' '.repeat(Math.max(0, Math.floor(n)))); }
  cmd(l) { this.outLfn = Math.floor(l); }
  prhcr(x) { this.out(this.fmt(x) + '\r'); this.outLfn = null; }
  prhend() { this.outLfn = null; }
  inch(l) { this.inLfn = Math.floor(l); }

  parseName(name) {
    let n = name, drive = '0';
    const m = /^([01])?:(.*)$/.exec(n); if (m) { drive = m[1] || '0'; n = m[2]; }
    const parts = n.split(','); const fname = parts[0];
    let type = 'P', mode = 'R';
    for (const p of parts.slice(1)) { const c = p[0]; if (c === 'R' || c === 'W' || c === 'A') mode = c; else if (c) type = c; }
    return { drive, fname, type, mode };
  }
  open(lfn, dev, sa = 0, name = '') {
    lfn = Math.floor(lfn); dev = Math.floor(dev); sa = Math.floor(sa);
    if (dev < 8 || dev > 11) { this.ch.set(lfn, { kind: 'null' }); return; }   // all disk devices share one simulated disk
    if (sa === 15) { this.ch.set(lfn, { kind: 'cmd', buf: '' }); if (name) this.doCmd(name); return; }
    if (name.startsWith('$')) { this.ch.set(lfn, { kind: 'file', data: this.dirListing(), pos: 0, mode: 'R' }); this.dstatus = '00, OK,00,00'; return; }
    const f = this.parseName(name);
    if (f.mode === 'R') {
      if (!this.files.has(f.fname)) { this.dstatus = '62,FILE NOT FOUND,00,00'; this.ch.set(lfn, { kind: 'null' }); return; }
      this.ch.set(lfn, { kind: 'file', name: f.fname, data: this.files.get(f.fname), pos: 0, mode: 'R' });
    } else {
      if (this.files.has(f.fname)) { this.dstatus = '63,FILE EXISTS,00,00'; this.ch.set(lfn, { kind: 'null' }); return; }
      const data = []; this.files.set(f.fname, data);
      this.ch.set(lfn, { kind: 'file', name: f.fname, data, pos: 0, mode: 'W' });
    }
    this.dstatus = '00, OK,00,00';
  }
  close(lfn) { this.ch.delete(Math.floor(lfn)); }
  closeAll() { this.ch.clear(); }
  dirListing() { return []; }
  doCmd(s) {
    s = s.replace(/\r$/, '');
    if (s[0] === 'S') {
      const m = /^S[01]?:(.*)$/.exec(s); let n = 0;
      if (m) for (const p of m[1].split(',')) if (this.files.delete(p)) n++;
      this.dstatus = '01, FILES SCRATCHED,' + String(n).padStart(2, '0') + ',00';
    } else this.dstatus = '00, OK,00,00';
  }
  writeByte(lfn, b) {
    const c = this.ch.get(lfn); if (!c) throw new Error('?FILE NOT OPEN ' + lfn);
    if (c.kind === 'cmd') { if (b === 13) { this.doCmd(c.buf); c.buf = ''; } else c.buf += String.fromCharCode(b); }
    else if (c.kind === 'file') { if (c.mode !== 'W') throw new Error('write to read file'); c.data.push(b); }
  }
  readByte(lfn) {
    const c = this.ch.get(lfn); if (!c) throw new Error('?FILE NOT OPEN ' + lfn);
    if (c.kind === 'cmd') {
      if (c.rd === undefined) c.rd = this.dstatus + '\r';
      const b = c.rd.charCodeAt(0); c.rd = c.rd.slice(1);
      this.st = c.rd.length ? 0 : 64; if (!c.rd.length) { c.rd = undefined; this.dstatus = '00, OK,00,00'; }
      return b;
    }
    if (c.kind === 'file') {
      if (c.pos < c.data.length) { const b = c.data[c.pos++]; this.st = c.pos === c.data.length ? 64 : 0; return b; }
      this.st = 66; return 13;
    }
    this.st = 66; return 13;
  }
  // GET var
  get(v, name, t) {
    let s;
    if (this.inLfn !== null) { const b = this.readByte(this.inLfn); s = b ? String.fromCharCode(b) : ''; this.inLfn = null; }
    else { if (!this.keys.length) throw new Error('keyboard queue empty (GET)'); s = this.keys.shift(); }
    v[name] = t === '$' ? s : (t === '%' ? this.toInt(cbmVal(s)) : cbmVal(s));
  }
  input() { this.inputMode = true; }
  readLine() {
    if (this.inLfn === null) {
      if (!this.lines.length) throw new Error('keyboard queue empty (INPUT)');
      const l = this.lines.shift(); this.toScreen(l + '\r'); return l;
    }
    let s = '';
    for (;;) { const b = this.readByte(this.inLfn); if (b === 13) break; s += String.fromCharCode(b); if (this.st) break; }
    for (let k = 0; k < s.length; k++) this.mem[0x1d00 + k] = s.charCodeAt(k);   // runtime input buffer
    this.mem[0x1d00 + s.length] = 0;
    return s;
  }
  assignField(v, name, t, f) {
    if (t === '$') v[name] = f.replace(/^ +/, '');
    else v[name] = t === '%' ? this.toInt(cbmVal(f)) : cbmVal(f);
  }
  nextField() { if (!this.fields) this.fields = this.readLine().split(','); return this.fields.length ? this.fields.shift() : ''; }
  inNext(v, name, t) { this.assignField(v, name, t, this.nextField()); }
  inLast(v, name, t) { this.assignField(v, name, t, this.nextField()); this.fields = null; this.inLfn = null; this.inputMode = false; }
  inOnly(v, name, t) { this.inLast(v, name, t); }

  // ---------- native machine-code helpers
  setLo(name, b) { this.v[name] = s16((this.v[name] & 0xff00) | (b & 255)); }
  sys(addr) {
    const v = this.v;
    switch (Math.floor(addr)) {
      case 288: case 291: {           // tokenizer: next char of Z$ at C1% -> C%, C2%=end of line, C3%=end of statement
        const raw = addr === 291;
        v.C2_i = 0; v.C3_i = 0;
        for (;;) {
          const i = ((v.C1_i & 255) + 1) & 255; this.setLo('C1_i', i);
          if (i >= (v.C4_i & 255)) { this.setLo('C_i', 0); v.C2_i = 1; v.C3_i = 1; return; }
          const ch = i < v.Z_s.length ? v.Z_s.charCodeAt(i) : 0;
          if (!raw && ch === 32) continue;
          this.setLo('C_i', ch); if (ch === 58) v.C3_i = 1;
          return;
        }
      }
      case 5872: {                    // read one BASIC line from file 2 into Z$, C4% = index of the closing 0
        v.C4_i = 0; const z = v.Z_s.split(''); let y = 0; this.st = 0;
        for (;;) {
          const b = this.readByte(2); z[y] = String.fromCharCode(b);
          if (b !== 0) { y = (y + 1) & 255; if (y === 0) break; continue; }
          if (y === 1) break;
          if (y >= 4) { v.C4_i = y; break; }
          y++;
        }
        v.Z_s = z.join(''); this.inLfn = this.outLfn = null; return;
      }
      case 5960: this.setLo('C1_i', this.readByte(2)); this.inLfn = null; return;          // N1%
      case 5985: this.writeByte(3, (v.C1_i & 255) ^ this.mem[0x1769]); this.outLfn = null; return; // N2%
      case 6012: {                    // N%: search integer array ARR(C5%) for C6% in C7% elements
        const arr = this.A[v.C5_i & 255]; const tg = v.C6_i & 0xffff;
        let n = v.C7_i & 0xffff; if (n === 0) n = 0x10000;
        v.C5_i = s16(0xff00 | (v.C5_i & 255));
        for (let k = 0; k < n; k++) if (arr[k] !== undefined && (arr[k] & 0xffff) === tg) { v.C5_i = k; return; }
        return;
      }
      case 5816: {                    // write memory [$1600/1,$1602/3) to file 3 (runtime image)
        const m = this.mem; const s = m[0x1600] | m[0x1601] << 8, e = m[0x1602] | m[0x1603] << 8;
        for (let p = s; p !== e; p = (p + 1) & 0xffff) this.writeByte(3, m[p]);
        this.outLfn = null; return;
      }
      default: throw new Error('SYS ' + addr + ' not implemented');
    }
  }
}
