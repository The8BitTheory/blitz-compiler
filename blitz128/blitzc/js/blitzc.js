// Blitz!128 compiler port - public API (Node and browser, no dependencies).
//
//   import { compile } from './blitzc.js';
//   const r = compile(sourcePrg, null, {   // null = embedded BLITZ!.128, or pass your own file name: 'PROG', runtime: true, fullSyntax: false, keys, pad });
//   runtime:    false = C/ without runtime routines (original menu: two drives, then 5)
//   runtimeKind: 'improved' (default), 'original' (untouched Skyles V860929 of 1986), 'fixed' (Fixed original runtime V261123: the original with all
//                bug fixes, no speed-ups, see fixed/) or 'improved' (Improved runtime V261123, fixes + speed-ups, see runtime2026/)
//   fastMath:   improved runtime only: 'auto' (default: on when the program uses * / ^ SQR LOG EXP COS SIN TAN ATN), true, false
//   fullSyntax: true  = "RESUME and COLLISION with full syntax" (original menu 4-6), else
//               "no COLLISION command, RESUME with linenumber only" (menu 1-3)
//   vdcSys:     true = convert the VDC-BASIC commands into USR/SYS calls of VDCSYS first (js/vdc2sys.js), so that the whole program is
//               compiled (no :: needed); r.vdcsys = the VDCSYS file (load address $1300, BLOADed by the converted program, needs
//               VDC-BASIC v3), r.converted = {prg, commands, initLine}. Unsupported VDC-BASIC commands throw an Error with the line number.
//   r.c  -> C/NAME (Uint8Array), r.z -> Z/NAME, r.errors, r.screen
//
// blitzPrg is the original BLITZ!.128 file: its runtime images are copied into
// every C/ file, exactly like the original does from memory.
import { run, VARS } from './compiler.gen.js';
import { Runtime } from './rt.js';
import { BLITZ_B64, BLITZ_ORIG_B64 } from './blitzimg.js';
import { makeD81 } from './d81.js';
import { RT2026 } from './rt2026img.js';
import { vdc2sys } from './vdc2sys.js';
import { VDCSYS } from './vdcsysimg.js';

export { VDCSYS };

const blitzCache = {};
// the compiler file, embedded (js/blitzimg.js): 'original' = untouched Skyles V860929 (1986), else the fixed build V261123
// (its runtime images are what the 'fixed' runtime copies unchanged; 'improved' adds the extension block to them)
export function blitzImage(kind) {
  const k = kind === 'original' ? 'original' : 'fixed';   // 'fixed' and 'improved' both start from the fixed build
  if (!blitzCache[k]) {
    const b64 = k === 'original' ? BLITZ_ORIG_B64 : BLITZ_B64;
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('latin1');
    blitzCache[k] = Uint8Array.from(bin, c => c.charCodeAt(0));
  }
  return blitzCache[k];
}

const petscii = s => s.toUpperCase();

// ---------- Improved 2026 runtime
const b64 = t => Uint8Array.from(typeof atob === 'function' ? atob(t) : Buffer.from(t, 'base64').toString('latin1'), c => c.charCodeAt(0));
const rtCache = {};
// decoded variant of js/rt2026img.js: {kind, img1, img2} with ext as Uint8Array
export function improvedRuntime(fastMath) {
  const k = fastMath && RT2026.fastmath ? 'fastmath' : 'plain';
  if (!rtCache[k]) {
    const v = RT2026[k], dec = d => ({ ...d, ext: b64(d.ext) });
    rtCache[k] = { kind: k, img1: dec(v[1]), img2: dec(v[2]) };
  }
  return rtCache[k];
}
// Does a tokenized BASIC 7 program use floating-point multiplication/division/power or SQR LOG EXP COS SIN TAN ATN?
// (tokens outside strings, REM and DATA lines)
const MATH_TOKENS = new Set([0xac, 0xad, 0xae, 0xba, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0, 0xc1]);
export function usesMath(prg) {
  const la = prg[0] | prg[1] << 8;
  for (let p = 2; p + 3 < prg.length;) {
    const next = prg[p] | prg[p + 1] << 8;
    if (!next) break;
    let q = false;
    for (let i = p + 4; i < prg.length && prg[i]; i++) {
      const b = prg[i];
      if (b === 0x22) q = !q;
      else if (!q && (b === 0x8f || b === 0x83)) break;        // REM, DATA: rest of the line is text
      else if (!q && (b === 0xce || b === 0xfe)) i++;          // two-byte tokens of BASIC 7
      else if (!q && MATH_TOKENS.has(b)) return true;
    }
    p = next - la + 2;
  }
  return false;
}
// the compiler image for a job: 'original' = untouched, 'fixed' and 'improved' = fixed build V261123
const imageKindFor = (opts, improved) => improved || kindOf(opts) === 'fixed' ? 'fixed' : 'original';
// the runtime kind reported for a job
const kindFor = (opts, improved) => improved ? 'improved' : kindOf(opts) === 'fixed' ? 'fixed' : 'original';
// the runtime choice for one job: all programs of a job use the same runtime (modules without runtime run behind the first one)
const kindOf = opts => opts.runtimeKind ?? 'improved';   // default: Improved runtime (like CLI and page)
function runtimeFor(opts, sources) {
  if (kindOf(opts) !== 'improved') return null;
  const fm = opts.fastMath === undefined || opts.fastMath === 'auto' ? sources.some(usesMath) : !!opts.fastMath;
  return improvedRuntime(fm);
}
// header address of a C/ file: behind the runtime image (original or improved, plain or fastmath), or the load address without runtime
function headerAddr(c) {
  const la = c[0] | c[1] << 8;
  if (la !== 0x1c01 && la !== 0x4001) return la;
  const img = la === 0x1c01 ? 1 : 2, cands = [la === 0x1c01 ? 0x46b0 : 0x6c41];
  for (const k of ['plain', 'fastmath']) if (RT2026[k]) cands.push(RT2026[k][img].end);
  // the header is followed by 0-9 padding bytes and then the entry point (header 2 word 3, XOR $79)
  for (const h of cands) {
    const H = h - la + 2; if (H + 18 > c.length) continue;
    const ent = (c[H + 6] ^ 0x79) | (c[H + 7] ^ 0x79) << 8;
    if (ent >= h + 18 && ent <= h + 27) return h;
  }
  return cands[0];
}
// which runtime a C/ file carries: 'original', 'fixed', 'improved', 'improved+fastmath' (null without runtime)
export function runtimeKindOf(c) {
  const la = c[0] | c[1] << 8;
  if (la !== 0x1c01 && la !== 0x4001) return null;
  const img = la === 0x1c01 ? 1 : 2, h = headerAddr(c);
  if (h === (img === 1 ? 0x46b0 : 0x6c41)) {
    // 'fixed' differs from 'original' in the FAST/SLOW jump operand of each image (tools/patch_blitz128.py): $3DC2 = F4 3D / $6353 = 85 63
    const at = (img === 1 ? 0x3dc2 : 0x6353) - la + 2;
    return c[at] === (img === 1 ? 0xf4 : 0x85) && c[at + 1] === (img === 1 ? 0x3d : 0x63) ? 'fixed' : 'original';
  }
  return RT2026.fastmath && h === RT2026.fastmath[img].end ? 'improved+fastmath' : 'improved';
}

// RND(0) values that make the original produce the given keys/padding:
// order of RND calls: keys W1,W3,W4,W5,W6,W2 (K0..K5 = W1..W6), then J%=INT(RND*10), then J% pad bytes INT(RND*255).
export function rndFor(keys, pad) {
  const [w1, w2, w3, w4, w5, w6] = keys;
  const q = [w1, w3, w4, w5, w6, w2].map(k => (k + 0.5) / 256);
  q.push((pad.length + 0.5) / 10);
  for (const b of pad) q.push((b + 0.5) / 255);
  return q;
}
// Read keys and padding back out of a C/ file (for byte-identical rebuilds).
export function keysOf(c) {
  const la = c[0] | c[1] << 8;
  const hdrAt = headerAddr(c);                                           // without runtime the file starts at the header
  const H = hdrAt - la + 2;
  let a = 0x2f; const keys = [];
  for (let i = 0; i < 6; i++) { a ^= c[H + 12 + i]; keys.push(a); }
  const ent = (c[H + 6] ^ 0x79) | (c[H + 7] ^ 0x79) << 8;
  const hdr = hdrAt + 18;
  const pad = Array.from(c.subarray(H + 18, H + 18 + (ent - hdr)));
  return { keys, pad };
}
// RND(0) values for several programs in one session (overlay mode): keys once, then per program J% and its padding bytes.
export function rndForMany(keys, pads) {
  const [w1, w2, w3, w4, w5, w6] = keys;
  const q = [w1, w3, w4, w5, w6, w2].map(k => (k + 0.5) / 256);
  for (const pad of pads) { q.push((pad.length + 0.5) / 10); for (const b of pad) q.push((b + 0.5) / 255); }
  return q;
}
export function validKey(k) { return (k & 15) !== 0 && (k & 240) !== 0; }

// Keyboard input that drives the original menus.
// With runtime: menu 1 (or 4) = single drive, one program with runtime; then the program name.
// Without runtime: menu 3 (or 6) = two drives, devices 8 -> 9, then 5 = single program without runtime.
function menuInput(runtime, full, name) {
  if (runtime) return { keys: full ? '4' : '1', lines: [name] };
  return { keys: (full ? '6' : '3') + '5', lines: ['8', '9', name] };
}

// line numbers of a tokenized BASIC program (PRG), in file order
export function sourceLines(prg) {
  const la = prg[0] | prg[1] << 8, out = [];
  for (let p = 2; p + 3 < prg.length;) {
    const next = prg[p] | prg[p + 1] << 8;
    if (!next) break;
    out.push(prg[p + 2] | prg[p + 3] << 8);
    p = next - la + 2;
  }
  return out;
}

// opts.onEvent(ev) is called while compiling:
//   {type:'start', total}                          total = number of source lines
//   {type:'pass', pass}                            PASS0/1/2 begins
//   {type:'progress', pass, line, index, total}    line = BASIC line number being processed, index = its position (1..total)
//   {type:'message', text}                         everything else the compiler prints (?extensions in N, errors, summary)
export function compile(source, blitz, opts = {}) {
  const name = petscii(opts.name || 'PROG');
  const conv = opts.vdcSys ? vdc2sys(source) : null;
  if (conv) source = conv.prg;
  let rnd = null;
  if (opts.keys) rnd = rndFor(opts.keys, opts.pad || []);
  const lines = sourceLines(source), pos = new Map(lines.map((n, i) => [n, i + 1]));
  const lastLine = {};
  const onEvent = opts.onEvent && (ev => {
    if (ev.type === 'progress') {
      ev.index = pos.get(ev.line) || 0; ev.total = lines.length;
      if (!ev.index || ev.line <= (lastLine[ev.pass] ?? -1)) return;   // pass 2 ends with a 0 (end marker of the line table)
      lastLine[ev.pass] = ev.line;
    }
    opts.onEvent(ev);
  });
  const improved = opts.improvedRuntime !== undefined ? opts.improvedRuntime : runtimeFor(opts, [source]);
  const rt = new Runtime(blitz || blitzImage(imageKindFor(opts, improved)), {
    files: { [name]: source },
    ...menuInput(opts.runtime !== false, !!opts.fullSyntax, name),
    rnd, maxSteps: opts.maxSteps, onEvent, improved,
  });
  if (onEvent) onEvent({ type: 'start', total: lines.length });
  rt.init(VARS);
  run(rt);
  const get = n => rt.files.has(n) ? Uint8Array.from(rt.files.get(n)) : null;
  const c = get('C/' + name);
  checkTop(c, improved);
  return {
    c, z: get('Z/' + name),
    errors: rt.v.X1_f + rt.v.X3_f, extensions: rt.v.X0_f,
    screen: rt.screen, messages: rt.messages, files: rt.files,
    runtimeKind: kindFor(opts, improved), fastMath: improved ? improved.kind === 'fastmath' : false,
    vdcsys: conv ? VDCSYS : null, converted: conv,
  };
}

// vdcSys option for several programs: every program converted once (an error becomes the result of that program)
function convertAll(programs, opts) {
  if (!opts.vdcSys) return programs.map(p => ({ p }));
  return programs.map(p => { try { const c = vdc2sys(p.src); return { p: { ...p, src: c.prg }, conv: c }; } catch (e) { return { p, error: e.message }; } });
}

// The improved runtime shares the top page $FC00-$FEFF between bank 0 and bank 1: the program must end below it.
function checkTop(c, improved) {
  if (!improved || !c) return;
  const end = (c[0] | c[1] << 8) + c.length - 2;
  if (end > 0xfc00) throw new Error('program ends at $' + end.toString(16) + ': the Improved 2026 runtime needs $FC00-$FEFF, use the original runtime');
}

// Program names as they go on disk: PETSCII upper case, at most 14 characters (the compiler cuts C/ names there),
// unique within one job (a repeated name gets a counter: PROG, PROG2, PROG3 ...).
export function diskNames(names) {
  const seen = new Set();
  return names.map(n => {
    const base = petscii((n || 'PROG').trim() || 'PROG').slice(0, 14);
    let out = base;
    for (let k = 2; seen.has(out); k++) out = base.slice(0, 14 - String(k).length) + k;
    seen.add(out);
    return out;
  });
}

// Several programs in one go: the first one with runtime (if any), all others without runtime, which only
// work behind an already loaded runtime. programs = [{src, name, runtime}], same options for all
// (fullSyntax, keys/pad). A failing program does not stop the rest. Returns [{name, runtime, c, z, errors, extensions, error?}].
// onEvent gets the compile() events plus {type:'program', index, count, name, runtime} before each program.
export function compileMany(programs, blitz, opts = {}, onEvent = null) {
  const names = diskNames(programs.map(p => p.name));
  const conv = convertAll(programs, opts);
  const improvedRuntime = runtimeFor(opts, conv.map(x => x.p.src));
  return conv.map(({ p, conv: cv, error }, index) => {
    const runtime = p.runtime !== false;
    if (onEvent) onEvent({ type: 'program', index, count: programs.length, name: names[index], runtime });
    const vdcsys = cv ? VDCSYS : null;
    if (error) {
      if (onEvent) onEvent({ type: 'message', text: names[index] + ': ' + error });
      return { name: names[index], runtime, c: null, z: null, errors: 1, extensions: 0, error, vdcsys: null };
    }
    try {
      const r = compile(p.src, blitz || null, { ...opts, vdcSys: false, name: names[index], runtime, onEvent, improvedRuntime });
      return { name: names[index], runtime, c: r.c, z: r.z, errors: r.errors, extensions: r.extensions, vdcsys, converted: cv };
    } catch (e) {
      if (onEvent) onEvent({ type: 'message', text: names[index] + ': ' + e.message });
      return { name: names[index], runtime, c: null, z: null, errors: 1, extensions: 0, error: e.message, vdcsys: null };
    }
  });
}

// Overlay mode = original menu item 4 ("all programs ... with overlay feature"), driven exactly like the original: the compiler gets a source
// disk (device 8) with all programs and an empty target disk (device 9), runs PASS0 over all of them - which gives every module the SAME
// variable-name table - and then PASS1/PASS2 per program. The first module contains the runtime, the others do not (they start behind it,
// at $46B0 / $6C41). Output files carry the plain program names (no C/ prefix, no Z/ file), like the original writes them; chain them with
// LOAD "NAME",8 - variables then survive (see analysis/runtime/OVERLAY.md).
// programs = [{src, name}] (>= 2 makes sense); opts: fullSyntax, keys/pads (reference run: keys = 6 key bytes, pads = one padding array per program).
// Returns [{name, runtime, c, z: null, errors, extensions, diskName}] in program order. onEvent gets the compile() events (progress refers to the
// program named in the last {type:'program'} event), {type:'program', index, count, name, runtime} when PASS1 reaches a program.
export function compileOverlay(programs0, blitz, opts = {}, onEvent = null) {
  const conv = convertAll(programs0, opts), bad = conv.find(x => x.error);
  if (bad) throw new Error(bad.error);
  const programs = conv.map(x => x.p), vdcsys = opts.vdcSys ? VDCSYS : null;
  const names = diskNames(programs.map(p => p.name));
  const files = {}; programs.forEach((p, i) => { files[names[i]] = p.src; });
  const lines = programs.map(p => sourceLines(p.src)), pos = lines.map(l => new Map(l.map((n, i) => [n, i + 1])));
  const lower = names.map(n => n.toLowerCase());
  let cur = 0, lastProg = -1; const lastLine = {}, per = [];
  const ev = e => {
    if (e.type === 'working') {
      const i = lower.indexOf(e.name.trim().toLowerCase()); if (i >= 0) cur = i;
      if (e.pass === 1 && i >= 0 && i !== lastProg) {
        lastProg = i; for (const k in lastLine) delete lastLine[k];
        if (onEvent) onEvent({ type: 'program', index: i, count: programs.length, name: names[i], runtime: i === 0, overlay: true });
      }
      return;
    }
    if (e.type === 'progress') {
      e.index = pos[cur].get(e.line) || 0; e.total = lines[cur].length;
      if (!e.index || e.line <= (lastLine[e.pass] ?? -1)) return;
      lastLine[e.pass] = e.line;
    }
    if (e.type === 'pass' && e.pass === 0) for (const k in lastLine) delete lastLine[k];
    if (e.type === 'message') { const m = /errors:\s*(\d+)\s+extensions:\s*(\d+)/i.exec(e.text); if (m) per.push([+m[1], +m[2]]); }
    if (onEvent) onEvent(e);
  };
  const rnd = opts.keys ? rndForMany(opts.keys, opts.pads || programs.map(() => [])) : null;
  const improved = runtimeFor(opts, programs.map(p => p.src));
  const rt = new Runtime(blitz || blitzImage(imageKindFor(opts, improved)), {
    files, split: true, rnd, maxSteps: opts.maxSteps, onEvent: ev, improved,
    keys: (opts.fullSyntax ? '6' : '3') + '4' + 'YY' + 'Y'.repeat(programs.length + 2),   // menu, item 4, "insert source disk" Y, "format target" Y, then "continue after errors?" Y
    lines: ['8', '9'],
  });
  if (onEvent) onEvent({ type: 'start', total: lines[0].length });
  rt.init(VARS);
  run(rt);
  const target = rt.disk(9);
  for (const n of names) if (target.has(n)) checkTop(Uint8Array.from(target.get(n)), improved);
  return programs.map((p, i) => ({
    name: names[i], runtime: i === 0, c: target.has(names[i]) ? Uint8Array.from(target.get(names[i])) : null, z: null,
    errors: per[i] ? per[i][0] : 0, extensions: per[i] ? per[i][1] : 0, diskName: names[i], vdcsys, converted: conv[i].conv,
  }));
}

// All outputs of compileMany() as .d81 image: C/NAME and Z/NAME per program (and VDCSYS when the vdcSys option was used).
export function d81Of(results, diskName = 'BLITZC') {
  const files = [];
  for (const r of results) { if (r.c) files.push({ name: r.diskName || 'C/' + r.name, data: r.c }); if (r.z) files.push({ name: 'Z/' + r.name, data: r.z }); }
  if (results.some(r => r.vdcsys)) files.push({ name: 'VDCSYS', data: VDCSYS });
  return makeD81(diskName, '01', files);
}

// One job as a message stream, for a Web Worker (js/worker.js) or the page itself.
// job = {programs: [{src, name, runtime}], blitz|null, like|null, fullSyntax}  (old form {src, name, runtime, ...} still works)
//   post gets the compile() events plus {type:'program', ...} and finally
//   {type:'done', results: [{name, runtime, c, z, errors, extensions, error?}], d81: Uint8Array|null, errors, extensions}  or  {type:'error', text}
export function compileJob(job, post) {
  try {
    const programs = job.programs || [{ src: job.src, name: job.name, runtime: job.runtime }];
    const overlay = !!job.overlay && programs.length > 1;   // "Shared variable table" checkbox: original menu item 4
    const rk = { runtimeKind: job.runtimeKind, fastMath: job.fastMath, vdcSys: !!job.vdcSys };
    const results = overlay ? compileOverlay(programs, job.blitz, { fullSyntax: job.fullSyntax, ...rk, ...(job.like ? { keys: keysOf(job.like).keys } : {}) }, post)
      : compileMany(programs, job.blitz, { fullSyntax: job.fullSyntax, ...rk, ...(job.like ? keysOf(job.like) : {}) }, post);
    const sum = k => results.reduce((a, r) => a + (r[k] || 0), 0);
    const imp = runtimeFor(rk, results.map((r, i) => r.converted ? r.converted.prg : programs[i].src));
    const vdcsys = results.some(r => r.vdcsys) ? VDCSYS : null;
    post({ type: 'done', results, overlay, vdcsys, d81: results.length > 1 || vdcsys ? d81Of(results) : null, errors: sum('errors'), extensions: sum('extensions'),
           c: results[0].c, z: results[0].z, runtimeKind: imp ? 'improved' : kindFor(rk, null), fastMath: !!imp && imp.kind === 'fastmath' });
  } catch (e) { post({ type: 'error', text: e.message }); }
}
