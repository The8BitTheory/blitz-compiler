// Minimal NMOS 6502 core (documented opcodes, binary mode only).
// Used for one thing: running the Blitz runtime's own VAL/FIN routine ($4314)
// together with the C128 BASIC math ROM, so float constants come out bit-exact.
export class CPU6502 {
  constructor(read, write) { this.r = read; this.w = write; this.a = this.x = this.y = 0; this.s = 0xff; this.p = 0x24; this.pc = 0; }
  get C() { return this.p & 1; }
  nz(v) { v &= 255; this.p = (this.p & 0x7d) | (v & 0x80) | (v ? 0 : 2); return v; }
  push(v) { this.w(0x100 | this.s, v & 255); this.s = (this.s - 1) & 255; }
  pop() { this.s = (this.s + 1) & 255; return this.r(0x100 | this.s); }
  rw(a) { return this.r(a) | this.r((a + 1) & 0xffff) << 8; }
  adc(v) {
    const c = this.C, r = this.a + v + c;
    this.p = (this.p & 0x3c) | (r > 255 ? 1 : 0) | ((~(this.a ^ v) & (this.a ^ r) & 0x80) ? 0x40 : 0);
    this.a = this.nz(r);
  }
  cmp(reg, v) { const r = reg - v; this.p = (this.p & 0x7c) | (r >= 0 ? 1 : 0); this.nz(r); }
  // run subroutine at addr until it returns; returns step count
  call(addr, maxSteps = 1e6) {
    this.push(0xff); this.push(0xfd); this.pc = addr;     // returns to $FFFE
    for (let n = 0; n < maxSteps; n++) { if (this.pc === 0xfffe) return n; this.step(); }
    throw new Error('6502: step limit');
  }
  step() {
    const r = this.r, op = r(this.pc), pc1 = (this.pc + 1) & 0xffff;
    const b1 = () => r(pc1), w1 = () => r(pc1) | r((pc1 + 1) & 0xffff) << 8;
    // addressing: returns effective address
    const ea = {
      zp: () => b1(), zpx: () => (b1() + this.x) & 255, zpy: () => (b1() + this.y) & 255,
      abs: () => w1(), abx: () => (w1() + this.x) & 0xffff, aby: () => (w1() + this.y) & 0xffff,
      izx: () => { const z = (b1() + this.x) & 255; return r(z) | r((z + 1) & 255) << 8; },
      izy: () => { const z = b1(); return ((r(z) | r((z + 1) & 255) << 8) + this.y) & 0xffff; },
    };
    const LEN = { imm: 2, zp: 2, zpx: 2, zpy: 2, abs: 3, abx: 3, aby: 3, izx: 2, izy: 2, imp: 1, acc: 1 };
    const d = OPS[op]; if (!d) throw new Error('6502: illegal opcode ' + op.toString(16) + ' at ' + this.pc.toString(16));
    const [mn, mode] = d;
    const val = () => mode === 'imm' ? b1() : r(ea[mode]());
    let next = (this.pc + (LEN[mode] || 2)) & 0xffff;
    const rmw = f => { if (mode === 'acc') this.a = f(this.a); else { const a = ea[mode](); this.w(a, f(r(a))); } };
    const br = cond => { if (cond) { const o = b1(); next = (next + (o < 128 ? o : o - 256)) & 0xffff; } };
    switch (mn) {
      case 'LDA': this.a = this.nz(val()); break;
      case 'LDX': this.x = this.nz(val()); break;
      case 'LDY': this.y = this.nz(val()); break;
      case 'STA': this.w(ea[mode](), this.a); break;
      case 'STX': this.w(ea[mode](), this.x); break;
      case 'STY': this.w(ea[mode](), this.y); break;
      case 'ADC': this.adc(val()); break;
      case 'SBC': this.adc(val() ^ 255); break;
      case 'AND': this.a = this.nz(this.a & val()); break;
      case 'ORA': this.a = this.nz(this.a | val()); break;
      case 'EOR': this.a = this.nz(this.a ^ val()); break;
      case 'CMP': this.cmp(this.a, val()); break;
      case 'CPX': this.cmp(this.x, val()); break;
      case 'CPY': this.cmp(this.y, val()); break;
      case 'BIT': { const v = val(); this.p = (this.p & 0x3d) | (v & 0xc0) | ((this.a & v) ? 0 : 2); break; }
      case 'ASL': rmw(v => { this.p = (this.p & 0xfe) | (v >> 7); return this.nz(v << 1); }); break;
      case 'LSR': rmw(v => { this.p = (this.p & 0xfe) | (v & 1); return this.nz(v >> 1); }); break;
      case 'ROL': rmw(v => { const c = this.C; this.p = (this.p & 0xfe) | (v >> 7); return this.nz((v << 1) | c); }); break;
      case 'ROR': rmw(v => { const c = this.C; this.p = (this.p & 0xfe) | (v & 1); return this.nz((v >> 1) | (c << 7)); }); break;
      case 'INC': rmw(v => this.nz(v + 1)); break;
      case 'DEC': rmw(v => this.nz(v - 1)); break;
      case 'INX': this.x = this.nz(this.x + 1); break;
      case 'INY': this.y = this.nz(this.y + 1); break;
      case 'DEX': this.x = this.nz(this.x - 1); break;
      case 'DEY': this.y = this.nz(this.y - 1); break;
      case 'TAX': this.x = this.nz(this.a); break;
      case 'TAY': this.y = this.nz(this.a); break;
      case 'TXA': this.a = this.nz(this.x); break;
      case 'TYA': this.a = this.nz(this.y); break;
      case 'TSX': this.x = this.nz(this.s); break;
      case 'TXS': this.s = this.x; break;
      case 'PHA': this.push(this.a); break;
      case 'PHP': this.push(this.p | 0x30); break;
      case 'PLA': this.a = this.nz(this.pop()); break;
      case 'PLP': this.p = (this.pop() & 0xef) | 0x20; break;
      case 'CLC': this.p &= 0xfe; break; case 'SEC': this.p |= 1; break;
      case 'CLI': this.p &= 0xfb; break; case 'SEI': this.p |= 4; break;
      case 'CLD': this.p &= 0xf7; break; case 'SED': this.p |= 8; break;
      case 'CLV': this.p &= 0xbf; break;
      case 'NOP': break;
      case 'BPL': br(!(this.p & 0x80)); break; case 'BMI': br(this.p & 0x80); break;
      case 'BVC': br(!(this.p & 0x40)); break; case 'BVS': br(this.p & 0x40); break;
      case 'BCC': br(!(this.p & 1)); break; case 'BCS': br(this.p & 1); break;
      case 'BNE': br(!(this.p & 2)); break; case 'BEQ': br(this.p & 2); break;
      case 'JMP': if (mode === 'abs') next = w1(); else { const p = w1(); next = r(p) | r((p & 0xff00) | ((p + 1) & 255)) << 8; } break;
      case 'JSR': { const ret = (this.pc + 2) & 0xffff; this.push(ret >> 8); this.push(ret); next = w1(); break; }
      case 'RTS': { const lo = this.pop(), hi = this.pop(); next = ((hi << 8 | lo) + 1) & 0xffff; break; }
      case 'RTI': { this.p = (this.pop() & 0xef) | 0x20; const lo = this.pop(), hi = this.pop(); next = hi << 8 | lo; break; }
      case 'BRK': throw new Error('6502: BRK at ' + this.pc.toString(16));
      default: throw new Error('6502: ' + mn);
    }
    this.pc = next;
  }
}
const OPS = [];
const def = (mn, list) => { for (const [op, mode] of list) OPS[op] = [mn, mode]; };
const G1 = (mn, base) => def(mn, [[base + 9, 'imm'], [base + 5, 'zp'], [base + 0x15, 'zpx'], [base + 0xd, 'abs'], [base + 0x1d, 'abx'], [base + 0x19, 'aby'], [base + 1, 'izx'], [base + 0x11, 'izy']]);
G1('ORA', 0x00); G1('AND', 0x20); G1('EOR', 0x40); G1('ADC', 0x60); G1('LDA', 0xa0); G1('CMP', 0xc0); G1('SBC', 0xe0);
def('STA', [[0x85, 'zp'], [0x95, 'zpx'], [0x8d, 'abs'], [0x9d, 'abx'], [0x99, 'aby'], [0x81, 'izx'], [0x91, 'izy']]);
const G2 = (mn, base) => def(mn, [[base + 0xa, 'acc'], [base + 6, 'zp'], [base + 0x16, 'zpx'], [base + 0xe, 'abs'], [base + 0x1e, 'abx']]);
G2('ASL', 0x00); G2('ROL', 0x20); G2('LSR', 0x40); G2('ROR', 0x60);
def('INC', [[0xe6, 'zp'], [0xf6, 'zpx'], [0xee, 'abs'], [0xfe, 'abx']]);
def('DEC', [[0xc6, 'zp'], [0xd6, 'zpx'], [0xce, 'abs'], [0xde, 'abx']]);
def('LDX', [[0xa2, 'imm'], [0xa6, 'zp'], [0xb6, 'zpy'], [0xae, 'abs'], [0xbe, 'aby']]);
def('LDY', [[0xa0, 'imm'], [0xa4, 'zp'], [0xb4, 'zpx'], [0xac, 'abs'], [0xbc, 'abx']]);
def('STX', [[0x86, 'zp'], [0x96, 'zpy'], [0x8e, 'abs']]);
def('STY', [[0x84, 'zp'], [0x94, 'zpx'], [0x8c, 'abs']]);
def('CPX', [[0xe0, 'imm'], [0xe4, 'zp'], [0xec, 'abs']]);
def('CPY', [[0xc0, 'imm'], [0xc4, 'zp'], [0xcc, 'abs']]);
def('BIT', [[0x24, 'zp'], [0x2c, 'abs']]);
def('JMP', [[0x4c, 'abs'], [0x6c, 'ind']]);
def('JSR', [[0x20, 'abs']]);
const IMP = { 0xea: 'NOP', 0xe8: 'INX', 0xc8: 'INY', 0xca: 'DEX', 0x88: 'DEY', 0xaa: 'TAX', 0xa8: 'TAY', 0x8a: 'TXA', 0x98: 'TYA', 0xba: 'TSX', 0x9a: 'TXS',
  0x48: 'PHA', 0x08: 'PHP', 0x68: 'PLA', 0x28: 'PLP', 0x18: 'CLC', 0x38: 'SEC', 0x58: 'CLI', 0x78: 'SEI', 0xd8: 'CLD', 0xf8: 'SED', 0xb8: 'CLV',
  0x60: 'RTS', 0x40: 'RTI', 0x00: 'BRK' };
for (const [op, mn] of Object.entries(IMP)) OPS[+op] = [mn, 'imp'];
const BR = { 0x10: 'BPL', 0x30: 'BMI', 0x50: 'BVC', 0x70: 'BVS', 0x90: 'BCC', 0xb0: 'BCS', 0xd0: 'BNE', 0xf0: 'BEQ' };
for (const [op, mn] of Object.entries(BR)) OPS[+op] = [mn, 'rel'];
