// Bit-exact VAL of the Blitz!128 runtime, without any ROM.
//
// Transliteration of
//   - the runtime's own FIN ($4314-$4450) and int->float ($2D41), and
//   - the C128 BASIC-hi ROM math routines it calls: FADDT ($8848), MUL10 ($8B17),
//     DIV10/FDIVT ($8B38), ROUND ($8C47), MOVAF/MOVFA, normalize ($88B6), MULDIV ($8AEC),
//     FIN tail ($8D67), digit add ($8DB8), NEGOP ($8FFA).
// Zero page as on the C128: FAC $63 exp, $64-$67 mantissa, $68 sign; ARG $6A-$6F;
// ARISGN $70, FACOV $71, OLDOV $58; FIN work cells $5F-$62, $69; int result $66/$67, type $10.
// Every routine keeps the 6502 carry semantics, so all rounding quirks are reproduced.
// Verified against the original code run on a 6502 core (js/cpu6502.js + ROM), see tools/fincheck.mjs.

class OverflowError extends Error {}

export function finVal(s) {
  const z = new Uint8Array(256);
  let C = 0;                                   // carry flag
  const B = i => s.charCodeAt(i) & 255;
  const len = Math.min(s.length, 255);

  // ---------- ROM helpers
  const incfac = () => {                       // $894E, returns Z (mantissa wrapped)
    for (const a of [0x67, 0x66, 0x65, 0x64]) { z[a] = (z[a] + 1) & 255; if (z[a]) return false; }
    return true;
  };
  const rorfac = () => {                       // $891B: ROR $64..$67,$71 with carry in
    for (const a of [0x64, 0x65, 0x66, 0x67, 0x71]) { const n = z[a] & 1; z[a] = (z[a] >> 1) | (C << 7); C = n; }
  };
  const incExpRor = () => {                    // $8917: INC exp (overflow at 0), ROR mantissa
    z[0x63] = (z[0x63] + 1) & 255; if (!z[0x63]) throw new OverflowError();
    rorfac();
  };
  const round = () => {                        // $8C47
    if (!z[0x63]) return;
    C = z[0x71] >> 7; z[0x71] = (z[0x71] << 1) & 255;
    if (!C) return;
    if (incfac()) incExpRor();                 // $8C54 JMP $8917 (C=1 -> top bit set again)
  };
  const movaf = () => {                        // $8C38: round FAC, copy FAC -> ARG
    round();
    for (let x = 6; x >= 1; x--) z[0x69 + x] = z[0x62 + x];
    z[0x71] = 0;
    return z[0x6a];                            // A = exponent (last byte copied)
  };
  const movfa = () => {                        // $8C28: ARG -> FAC
    z[0x68] = z[0x6f];
    for (let x = 5; x >= 1; x--) z[0x62 + x] = z[0x69 + x];
    z[0x71] = 0;
  };
  const zerofac = () => { z[0x63] = 0; z[0x68] = 0; };   // $88D6
  // $8964-$899B: shift the 5-byte value at base+1..base+4 (+A as low byte) right; A = -count (8-bit)
  const shiftr = (base, A) => {
    // $8979 entry (byte shifts while A+8 <= 0)
    for (;;) {
      let r = A + 8 + C; C = r > 255 ? 1 : 0; A = r & 255;
      if (A & 0x80 || A === 0) {               // BMI/BEQ $8964: shift one byte
        z[0x71] = z[base + 4]; z[base + 4] = z[base + 3]; z[base + 3] = z[base + 2]; z[base + 2] = z[base + 1];
        z[base + 1] = 0;                       // LDY $03DF (0 in the compiler's memory)
        continue;
      }
      break;
    }
    // $897F SBC #8; TAY; LDA $71; BCS $899A
    { const r = A - 8 - (1 - C); C = r >= 0 ? 1 : 0; A = r & 255; }
    let Y = A; A = z[0x71];
    if (C) { C = 0; return A; }
    return bitshift(base, A, Y);
  };
  // $8986 loop: arithmetic shift right of base+1, ROR base+2..4 and A; Y counts up to 0
  const bitshift = (base, A, Y, first) => {
    for (;;) {
      if (first) {                             // $887D LSR 1,X then $8990
        C = z[base + 1] & 1; z[base + 1] >>= 1; first = false;
      } else {
        // ASL 1,X; BCC +2; INC 1,X; ROR 1,X; ROR 1,X
        let v = z[base + 1]; C = v >> 7; v = (v << 1) & 255;
        if (C) v = (v + 1) & 255;
        let n = v & 1; v = (v >> 1) | (C << 7); C = n;
        n = v & 1; v = (v >> 1) | (C << 7); C = n;
        z[base + 1] = v;
      }
      for (const a of [base + 2, base + 3, base + 4]) { const n = z[a] & 1; z[a] = (z[a] >> 1) | (C << 7); C = n; }
      { const n = A & 1; A = (A >> 1) | (C << 7); C = n; }
      Y = (Y + 1) & 255;
      if (!Y) break;
    }
    C = 0; return A;                           // $899A CLC; RTS
  };
  // FADDT $8848 (Z from LDX $63 / TAX before), only the "same sign" path is reachable from FIN
  const faddt = () => {
    if (!z[0x63]) { movfa(); return; }
    z[0x58] = z[0x71];
    let X = 0x6a; let A = z[0x6a];
    fadd855(A, X);
  };
  const fadd855 = (A, X) => {                  // $8855 (A = ARG exponent)
    const Y = A; if (!Y) return;
    let r = A - z[0x63]; C = r >= 0 ? 1 : 0; A = r & 255;
    if (A !== 0) {
      if (!C) {                                // $8872: ARG smaller, shift ARG
        z[0x71] = 0;
      } else {                                 // ARG bigger: shift FAC
        z[0x63] = Y; z[0x68] = z[0x6f];
        A ^= 0xff; r = A + C; C = r > 255 ? 1 : 0; A = r & 255;    // EOR #$FF; ADC #0
        z[0x58] = 0; X = 0x63;
      }
      // $8876 CMP #$F9; BMI $8840
      C = A >= 0xf9 ? 1 : 0;                   // CMP #$F9
      if ((A - 0xf9) & 0x80) { A = shiftr(X, A); }    // $8840 JSR $8979 ; BCC $8882 (always clear)
      else { const Yc = A; A = bitshift(X, z[0x71], Yc, true); }  // TAY; LDA $71; LSR 1,X; JSR $8990
    }
    // $8882 BIT $70; BPL $88DD (ARISGN is 0 on every path from FIN)
    if (z[0x70] & 0x80) throw new Error('fadd: subtraction path not ported');
    let r2 = A + z[0x58] + C; C = r2 > 255 ? 1 : 0; z[0x71] = r2 & 255;
    for (const [f, a] of [[0x67, 0x6e], [0x66, 0x6d], [0x65, 0x6c], [0x64, 0x6b]]) {
      const t = z[f] + z[a] + C; C = t > 255 ? 1 : 0; z[f] = t & 255;
    }
    if (C) incExpRor();                         // $8915 BCC rts; $8917
  };
  const normalize = () => {                    // $88B6 (Y=0, A=0, CLC)
    let A = 0; C = 0;
    for (;;) {                                 // $88BA
      if (z[0x64]) break;
      // byte shift left: $88BE-$88D4
      z[0x64] = z[0x65]; z[0x65] = z[0x66]; z[0x66] = z[0x67]; z[0x67] = z[0x71]; z[0x71] = 0;
      const r = A + 8 + C; C = r > 255 ? 1 : 0; A = r & 255;
      if (A === 0x20) { zerofac(); return; }
    }
    // $8908 BPL $88FC: shift left until top bit set, counting in A
    while (!(z[0x64] & 0x80)) {
      const r = A + 1 + C; C = r > 255 ? 1 : 0; A = r & 255;
      for (const a of [0x71, 0x67, 0x66, 0x65, 0x64]) { const n = z[a] >> 7; z[a] = ((z[a] << 1) | C) & 255; C = n; }
    }
    // $890A SEC; SBC $63; BCS zero; EOR #$FF; ADC #1; STA $63
    let r = A - z[0x63]; C = r >= 0 ? 1 : 0; A = r & 255;
    if (C) { zerofac(); return; }
    A ^= 0xff; r = A + 1 + C; C = r > 255 ? 1 : 0; z[0x63] = r & 255;
    if (C) incExpRor();                         // $8915
  };
  const muldiv = () => {                       // $8AEC (FAC exp already negated)
    let A = z[0x6a];
    if (!A) { zerofac(); return false; }       // $8B0F: PLA PLA -> result 0
    let r = A + z[0x63]; C = r > 255 ? 1 : 0; A = r & 255;
    if (!C) { if (!(A & 0x80)) { zerofac(); return false; } }    // BPL $8B0F (underflow)
    else if (A & 0x80) throw new OverflowError();
    r = A + 0x80; A = r & 255;                 // CLC; ADC #$80
    z[0x63] = A;
    if (!A) { z[0x68] = 0; return true; }      // $88DA STA $68 with A=0
    z[0x68] = z[0x70];
    return true;
  };
  const mul10 = () => {                        // $8B17
    let A = movaf(); if (!A) return;
    const r = A + 2; if (r > 255) throw new OverflowError();
    z[0x70] = 0;
    fadd855(r & 255, 0x6a);
    z[0x63] = (z[0x63] + 1) & 255; if (!z[0x63]) throw new OverflowError();
  };
  const div10 = () => {                        // $8B38
    movaf();
    z[0x70] = 0;
    z[0x63] = 0x84; z[0x68] = 0x20; z[0x64] = 0xa0; z[0x65] = 0; z[0x66] = 0; z[0x67] = 0; z[0x71] = 0;  // MOVFM 10.0
    round();
    z[0x63] = (0 - z[0x63]) & 255;
    if (!muldiv()) return;
    z[0x63] = (z[0x63] + 1) & 255; if (!z[0x63]) throw new OverflowError();
    // $8B5F: restoring division ARG / FAC, 32 quotient bits + 2 rounding bits
    let X = -4, A = 1;
    const res = [0, 0, 0, 0];
    const cmp = () => {                        // $8B63: compare ARG with FAC mantissa
      for (const [a, f] of [[0x6b, 0x64], [0x6c, 0x65], [0x6d, 0x66], [0x6e, 0x67]]) {
        if (z[a] !== z[f]) return z[a] > z[f] ? 1 : 0;
      }
      return 1;
    };
    let c = cmp();
    for (;;) {
      // $8B79 PHP; ROL A
      const saved = c;
      const out = A >> 7; A = ((A << 1) | c) & 255;
      if (out) {
        X++;
        if (X <= 0) res[X + 3] = A;            // STA $2B,X
        if (X === 0) { A = 0x40; }             // $8BB4
        else if (X > 0) {                      // $8BB8: done
          z[0x71] = (A << 6) & 255;
          z[0x64] = res[0]; z[0x65] = res[1]; z[0x66] = res[2]; z[0x67] = res[3];
          normalize();
          return;
        } else A = 1;
      }
      // $8B86 PLP; BCS subtract
      if (saved) {
        let b = 0;
        for (const [a, f] of [[0x6e, 0x67], [0x6d, 0x66], [0x6c, 0x65], [0x6b, 0x64]]) {
          const t = z[a] - z[f] - b; b = t < 0 ? 1 : 0; z[a] = t & 255;
        }
      }
      // $8B89: ASL ARG
      let top = 0;
      for (const a of [0x6e, 0x6d, 0x6c, 0x6b]) { const n = z[a] >> 7; z[a] = ((z[a] << 1) | top) & 255; top = n; }
      if (top) c = 1;                          // BCS $8B79
      else if (z[0x6b] & 0x80) c = cmp();      // BMI $8B63
      else c = 0;                              // BPL $8B79 (C clear)
    }
  };
  const addDigit = d => {                      // runtime $43D0 + ROM $8DB8
    z[0x6a] = DEXP[d]; z[0x6b] = DMANT[d]; z[0x6c] = z[0x6d] = z[0x6e] = z[0x6f] = 0;
    z[0x70] = z[0x6f] ^ z[0x68];
    faddt();
  };
  const int2float = () => {                    // $2D41
    z[0x10] = 0; z[0x71] = 0; z[0x63] = 0; z[0x64] = 0; z[0x65] = 0;
    let X = 0x90, A = z[0x66];
    z[0x68] = A;
    if (A & 0x80) { negInt(); A = z[0x66]; }
    if (!A) {
      X = 0x88; A = z[0x67];
      if (!A) return;
      z[0x67] = 0;
    }
    while (!(A & 0x80)) { X--; const n = z[0x67] >> 7; z[0x67] = (z[0x67] << 1) & 255; A = ((A << 1) | n) & 255; }
    z[0x64] = A; z[0x65] = z[0x67]; z[0x63] = X; z[0x66] = 0; z[0x67] = 0;
  };
  const negInt = () => {                       // $26CE
    z[0x66] ^= 0xff; z[0x67] ^= 0xff;
    z[0x67] = (z[0x67] + 1) & 255; if (!z[0x67]) z[0x66] = (z[0x66] + 1) & 255;
  };
  const finTail = () => {                      // $8D67
    let A = (z[0x62] & 0x80) ? (0 - z[0x60]) & 255 : z[0x60];
    A = (A - z[0x5f]) & 255; z[0x60] = A;
    if (A) {
      if (A & 0x80) { do { div10(); z[0x60] = (z[0x60] + 1) & 255; } while (z[0x60]); }
      else { do { mul10(); z[0x60] = (z[0x60] - 1) & 255; } while (z[0x60]); }
    }
    if (z[0x69] & 0x80 && z[0x63]) z[0x68] ^= 0xff;      // NEGOP
  };

  // ---------- runtime FIN $4314
  const run = () => {
    z[0x10] = 0x80;
    let y = -1, ch;
    const next = () => { y++; return y >= len ? -1 : B(y); };
    // sign, then integer digits
    do ch = next(); while (ch === 0x20);
    if (ch === 0x2b || ch === 0x2d) { if (ch === 0x2d) z[0x69] = 0xff; do ch = next(); while (ch === 0x20); }
    let pending = -1;                          // digit that overflowed the integer path
    for (;;) {
      if (ch < 0) return endInt();
      if (ch >= 0x30 && ch <= 0x39) {
        if (z[0x66] >= 0x0c) { pending = ch; int2float(); break; }
        const v = ((z[0x66] << 8 | z[0x67]) * 10 + (ch & 15)) & 0xffff;
        z[0x66] = v >> 8; z[0x67] = v & 255;
        do ch = next(); while (ch === 0x20);
        continue;
      }
      if (ch === 0x2e) { int2float(); return fraction(true); }
      if (ch === 0x45) { int2float(); return exponent(); }
      return endInt();
    }
    // $43BE with the overflowing digit
    digit(pending);
    return fraction(false);

    function endInt() { if (z[0x69] & 0x80) negInt(); }
    function digit(c) {
      if (z[0x61] & 0x80) z[0x5f] = (z[0x5f] + 1) & 255;
      mul10();
      const d = c & 15; if (d) addDigit(d);
    }
    function fraction(dot) {
      if (dot) { z[0x61] = (z[0x61] >> 1) | 0x80; if (z[0x61] & 0x40) return finTail(); }
      for (;;) {
        do ch = next(); while (ch === 0x20);
        if (ch < 0) return finTail();
        if (ch === 0x2e) { z[0x61] = (z[0x61] >> 1) | 0x80; if (z[0x61] & 0x40) return finTail(); continue; }
        if (ch < 0x30) return finTail();
        if (ch > 0x39) { if (ch === 0x45) return exponent(); return finTail(); }
        digit(ch);
      }
    }
    function exponent() {
      do ch = next(); while (ch === 0x20);
      if (ch < 0) return finTail();
      if (ch === 0x2b || ch === 0x2d) { if (ch === 0x2d) z[0x62] = (z[0x62] - 1) & 255; do ch = next(); while (ch === 0x20); }
      for (;;) {
        if (ch < 0x30 || ch > 0x39) return finTail();
        const d = ch & 15;
        if (z[0x60] >= 10) { if (!(z[0x62] & 0x80)) throw new OverflowError(); z[0x60] = 100; }
        else z[0x60] = (z[0x60] * 10 + d) & 255;
        do ch = next(); while (ch === 0x20);
        if (ch < 0) return finTail();
      }
    }
  };
  run();
  // result as the store would see it: integer in $66/$67, or FAC rounded with FACOV (MOVMF)
  if (z[0x10] & 0x80) { const v = z[0x66] << 8 | z[0x67]; return v & 0x8000 ? v - 0x10000 : v; }
  round();
  if (!z[0x63]) return 0;
  const m = z[0x64] * 2 ** 24 + z[0x65] * 65536 + z[0x66] * 256 + z[0x67];
  const r = m * Math.pow(2, z[0x63] - 128 - 32);
  return z[0x68] & 0x80 ? -r : r;
}
export { OverflowError };
const DEXP = [0, 0x81, 0x82, 0x82, 0x83, 0x83, 0x83, 0x83, 0x84, 0x84];   // runtime table $4566
const DMANT = [0, 0x80, 0x80, 0xc0, 0x80, 0xa0, 0xc0, 0xe0, 0x80, 0x90];  // runtime table $456F
