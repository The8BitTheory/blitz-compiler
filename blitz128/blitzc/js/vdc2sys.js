// vdc2sys: turns the VDC-BASIC commands of a tokenized BASIC 7 program into USR/SYS calls of VDCSYS, so that the compiler
// compiles the whole program (no :: and no interpreter for the extension). Port of vdc2sys.py (vdc-basic, examples/vertrot).
//
//   VDL a,b,c,d,e  (with or without :: in front)  ->  YY=USR(a):YY=USR(b):YY=USR(c):YY=USR(d):YY=USR(e):SYS4867
//   (each USR puts one parameter on the stack of VDCSYS, the SYS runs the command)
//   supported: VDL VMC VMF SYN RGW RGO RGA RST DISP ATTR VDM VDR; VMC and VMF only in their three parameter form
//   RGD(e) in an expression is computed in front of its statement: YY=USR(e):SYS4888:Y0=PEEK(4906), Y0 (Y1, ...) takes its place
//   IF ... THEN::cmd  ->  IF ... THEN <the converted statements>
//   a new line BLOAD"VDCSYS",B0:SYS4864 loads and installs VDCSYS (behind the REM lines at the start, so that **NE and
//   other directives stay first)
// VDCSYS (vdcsys/vdcsys.s, embedded in vdcsysimg.js) needs VDC-BASIC v3 (vdcbasic3.bin at $1C00): VDL and VDM run its own code.
// The names YY and Y0..Y9 must not be used by the program. Other VDC-BASIC keywords and other forms are errors with the line number.

const CMD = {   // second token byte after $FE -> [SYS address, number of parameters (null = pairs)]
  0x3e: ['VDL', 4867, 5], 0x2e: ['VMC', 4870, 3], 0x2d: ['VMF', 4873, 3], 0x34: ['SYN', 4876, null], 0x27: ['RGW', 4879, 2],
  0x29: ['RGO', 4882, 2], 0x28: ['RGA', 4885, 2], 0x33: ['RST', 4891, 1], 0x35: ['DISP', 4894, 1], 0x36: ['ATTR', 4897, 1],
  0x42: ['VDM', 4900, 3], 0x3f: ['VDR', 4903, 5],
};
const OTHER = { 0x2a: 'VMW', 0x2b: 'VMA', 0x2c: 'VMO', 0x2f: 'RTV', 0x30: 'VTR', 0x31: 'VCC', 0x32: 'SWP', 0x37: 'CRSR', 0x38: 'VCS',
  0x39: 'VMP', 0x3b: 'VCL', 0x3c: 'VMS', 0x3d: 'VMB', 0x40: 'VDB', 0x41: 'RXV' };
const T = { USR: 0xb7, SYS: 0x9e, PEEK: 0xc2, IF: 0x8b, THEN: 0xa7, REM: 0x8f, DATA: 0x83, EQ: 0xb2, EXT: 0xfe, FN: 0xce, BLOAD: 0x11 };
const RGD = 0x0b, VMD = 0x0c, RGD_SYS = 4888, RES = 4906;
const asc = s => [...s].map(c => c.charCodeAt(0));
const DUMMY = asc('YY');

class ConvError extends Error {}

// The lines of a tokenized program: [{num, body: [bytes]}] and the load address
export function programLines(prg) {
  const la = prg[0] | prg[1] << 8, out = [];
  let p = 2;
  while (p + 3 < prg.length) {
    const next = prg[p] | prg[p + 1] << 8;
    if (!next) break;
    const num = prg[p + 2] | prg[p + 3] << 8;
    let e = p + 4;
    while (e < prg.length && prg[e] !== 0) e++;
    out.push({ num, body: Array.from(prg.subarray(p + 4, e)) });
    p = e + 1;
  }
  return { la, lines: out };
}

export function linkProgram(la, lines) {
  const out = [la & 255, la >> 8];
  let addr = la;
  for (const { num, body } of lines) {
    const next = addr + 4 + body.length + 1;
    out.push(next & 255, next >> 8, num & 255, num >> 8, ...body, 0);
    addr = next;
  }
  out.push(0, 0);
  return Uint8Array.from(out);
}

// Statements of a line body, split at ':' outside strings; after REM or DATA the rest stays together
function statements(body) {
  const out = []; let cur = [], q = false;
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (b === 0x22) q = !q;
    if (!q) {
      if (b === 0x3a) { out.push(cur); cur = []; continue; }
      if ((b === T.REM || b === T.DATA) && cur.every(x => x === 0x20)) { cur.push(...body.slice(i)); break; }
      if (b === T.EXT || b === T.FN) { cur.push(b, body[++i]); continue; }   // two byte token
    }
    cur.push(b);
  }
  out.push(cur);
  return out;
}

const trim = s => { let a = 0, e = s.length; while (a < e && s[a] === 0x20) a++; while (e > a && s[e - 1] === 0x20) e--; return s.slice(a, e); };

// Split at ',' outside strings and parentheses
function splitArgs(s) {
  const out = []; let cur = [], depth = 0, q = false;
  for (let i = 0; i < s.length; i++) {
    const b = s[i];
    if (b === 0x22) q = !q;
    else if (!q) {
      if (b === T.EXT || b === T.FN) { cur.push(b, s[++i]); continue; }
      if (b === 0x28) depth++;
      else if (b === 0x29) depth--;
      else if (b === 0x2c && depth === 0) { out.push(cur); cur = []; continue; }
    }
    cur.push(b);
  }
  out.push(cur);
  return out.map(trim);
}

// Index of a byte at top level (outside strings and parentheses) or -1
function findTop(s, byte, from = 0) {
  let depth = 0, q = false;
  for (let i = from; i < s.length; i++) {
    const b = s[i];
    if (b === 0x22) q = !q;
    else if (!q) {
      if (b === T.EXT || b === T.FN) { i++; continue; }
      if (b === 0x28) depth++;
      else if (b === 0x29) depth--;
      else if (b === byte && depth === 0) return i;
    }
  }
  return -1;
}

const num = n => asc(String(n));
const usr = arg => [...DUMMY, T.EQ, T.USR, 0x28, ...arg, 0x29];
const sys = addr => [T.SYS, ...num(addr)];

class Line {
  constructor(n) { this.n = n; this.tmp = 0; }
  err(msg) { throw new ConvError(`line ${this.n}: ${msg}`); }

  // RGD(e) -> Yk with the statements that compute it
  hoist(s) {
    const pre = [];
    for (;;) {
      let at = -1, q = false;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === 0x22) q = !q;
        else if (!q && (s[i] === T.EXT || s[i] === T.FN)) {
          if (s[i] === T.FN && s[i + 1] === VMD) this.err('VMD is not supported');
          if (s[i] === T.FN && s[i + 1] === RGD) { at = i; break; }
          i++;
        }
      }
      if (at < 0) return [pre, s];
      let j = at + 2;
      while (j < s.length && s[j] === 0x20) j++;
      if (s[j] !== 0x28) this.err('RGD without (');
      let depth = 1, k = j + 1;
      for (; k < s.length && depth; k++) { if (s[k] === 0x28) depth++; else if (s[k] === 0x29) depth--; }
      if (depth) this.err('RGD( without )');
      if (this.tmp > 9) this.err('too many RGD in one line');
      const v = asc('Y' + this.tmp++);
      pre.push(usr(s.slice(j + 1, k - 1)), sys(RGD_SYS), [...v, T.EQ, T.PEEK, 0x28, ...num(RES), 0x29]);
      s = [...s.slice(0, at), ...v, ...s.slice(k)];
    }
  }

  // one statement -> list of statements
  stmt(s0) {
    const s = trim(s0);
    if (!s.length) return [];
    if (s[0] === T.REM || s[0] === T.DATA) return [s0];
    const [pre, t] = this.hoist(s);
    if (t[0] === T.IF) {
      const th = findTop(t, T.THEN);
      if (th >= 0) {
        const then = trim(t.slice(th + 1));
        if (then.length && !(then[0] >= 0x30 && then[0] <= 0x39)) return [...pre, [...t.slice(0, th + 1), 0x20, ...this.stmt(then).flatMap((x, i) => i ? [0x3a, ...x] : x)]];
      }
      return [...pre, t];
    }
    if (t[0] === T.EXT && CMD[t[1]]) {
      const [name, addr, n] = CMD[t[1]];
      const rest = trim(t.slice(2)), args = rest.length ? splitArgs(rest) : [];
      if (n !== null && args.length !== n) this.err(`${name} with ${args.length} parameters (supported: ${n})`);
      if (n === null && args.length % 2) this.err('SYN with an odd number of parameters');
      return [...pre, ...args.map(usr), sys(addr)];
    }
    if (t[0] === T.EXT && OTHER[t[1]]) this.err(`${OTHER[t[1]]} is not supported`);
    return [...pre, t];
  }
}

// identifiers (first two characters) outside strings, REM and DATA
function usedNames(lines) {
  const used = new Set();
  for (const { body } of lines)
    for (const st of statements(body)) {
      const s = trim(st);
      if (s[0] === T.REM || s[0] === T.DATA) continue;
      let q = false;
      for (let i = 0; i < s.length; i++) {
        const b = s[i];
        if (b === 0x22) { q = !q; continue; }
        if (q) continue;
        if (b === T.EXT || b === T.FN) { i++; continue; }
        if (b >= 0x41 && b <= 0x5a && !(i && ((s[i - 1] >= 0x41 && s[i - 1] <= 0x5a) || (s[i - 1] >= 0x30 && s[i - 1] <= 0x39)))) {
          let j = i; while (j < s.length && ((s[j] >= 0x41 && s[j] <= 0x5a) || (s[j] >= 0x30 && s[j] <= 0x39))) j++;
          used.add(String.fromCharCode(...s.slice(i, Math.min(j, i + 2))));
          i = j - 1;
        }
      }
    }
  return used;
}

// convert(prg, {initLine}) -> {prg, commands, initLine}; throws an Error with the line number for anything not supported
export function convert(prg, opts = {}) {
  const { la, lines } = programLines(prg);
  if (!lines.length) throw new Error('vdc2sys: empty program');
  const used = usedNames(lines);
  for (const v of ['YY', ...Array.from({ length: 10 }, (_, k) => 'Y' + k)])
    if (used.has(v)) throw new Error(`vdc2sys: the program uses the variable ${v}`);
  // the init line: behind the REM lines at the start (directives such as **NE must stay first)
  let init = opts.initLine;
  if (init === undefined) {
    let k = 0;
    while (k < lines.length && trim(lines[k].body)[0] === T.REM) k++;
    const prev = k ? lines[k - 1].num : -1, next = k < lines.length ? lines[k].num : 64000;
    if (next - prev < 2) throw new Error(`vdc2sys: no free line number between ${prev} and ${next} for the init line`);
    init = prev + 1;
  }
  if (lines.some(l => l.num === init)) throw new Error(`vdc2sys: line ${init} exists already`);
  let commands = 0;
  const out = [];
  const initBody = [T.EXT, T.BLOAD, 0x22, ...asc('VDCSYS'), 0x22, 0x2c, 0x42, 0x30, 0x3a, ...sys(4864)];
  let placed = false;
  for (const { num: n, body } of lines) {
    if (!placed && n > init) { out.push({ num: init, body: initBody }); placed = true; }
    const L = new Line(n), parts = statements(body), res = [];
    try {
      for (let i = 0; i < parts.length; i++) {
        const p = trim(parts[i]);
        // IF ... THEN::cmd: the empty statements after THEN belong to the THEN part (the rest of the line)
        if (p.length && p[p.length - 1] === T.THEN && i + 1 < parts.length && !trim(parts[i + 1]).length) {
          let j = i + 1; while (j < parts.length && !trim(parts[j]).length) j++;
          const body2 = parts.slice(j).flatMap(q => L.stmt(q));
          const [pre, cond] = L.hoist(p);
          res.push(...pre, [...cond, 0x20, ...body2.flatMap((x, k) => k ? [0x3a, ...x] : x)]);
          break;
        }
        res.push(...L.stmt(parts[i]));
      }
    } catch (e) { if (e instanceof ConvError) throw new Error('vdc2sys: ' + e.message); throw e; }
    const nb = res.flatMap((x, k) => k ? [0x3a, ...x] : x);
    commands += nb.filter((b, k) => b === T.SYS && nb[k + 1] >= 0x30 && nb[k + 1] <= 0x39).length;
    if (nb.length > 250) throw new Error(`vdc2sys: line ${n} is longer than 250 bytes after the conversion`);
    out.push({ num: n, body: nb });
  }
  if (!placed) out.push({ num: init, body: initBody });
  return { prg: linkProgram(la, out), commands, initLine: init };
}

export const vdc2sys = convert;   // the name blitzc.js uses (also in the bundled page, where the imports are gone)

// Does the program contain VDC-BASIC tokens ($FE $27..$FE $42, $CE $0B/$0C)?
export function usesVdcBasic(prg) {
  const { lines } = programLines(prg);
  for (const { body } of lines) {
    let q = false;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === 0x22) q = !q;
      else if (!q && (body[i] === T.EXT || body[i] === T.FN)) {
        const b = body[i + 1];
        if ((body[i] === T.EXT && b >= 0x27 && b <= 0x42) || (body[i] === T.FN && (b === RGD || b === VMD))) return true;
        i++;
      }
    }
  }
  return false;
}
