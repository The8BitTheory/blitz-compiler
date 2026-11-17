// Blitz!128 compiler port - public API (Node and browser, no dependencies).
//
//   import { compile } from './blitzc.js';
//   const r = compile(sourcePrg, null, {   // null = embedded BLITZ!.128, or pass your own file name: 'PROG', runtime: true, fullSyntax: false, keys, pad });
//   runtime:    false = C/ without runtime routines (original menu: two drives, then 5)
//   fullSyntax: true  = "RESUME and COLLISION with full syntax" (original menu 4-6), else
//               "no COLLISION command, RESUME with linenumber only" (menu 1-3)
//   r.c  -> C/NAME (Uint8Array), r.z -> Z/NAME, r.errors, r.screen
//
// blitzPrg is the original BLITZ!.128 file: its runtime images are copied into
// every C/ file, exactly like the original does from memory.
import { run, VARS } from './compiler.gen.js';
import { Runtime } from './rt.js';
import { BLITZ_B64 } from './blitzimg.js';
import { makeD81 } from './d81.js';

let blitzCache = null;
// the original compiler file, embedded (js/blitzimg.js)
export function blitzImage() {
  if (!blitzCache) {
    const bin = typeof atob === 'function' ? atob(BLITZ_B64) : Buffer.from(BLITZ_B64, 'base64').toString('latin1');
    blitzCache = Uint8Array.from(bin, c => c.charCodeAt(0));
  }
  return blitzCache;
}

const petscii = s => s.toUpperCase();

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
  const hdrAt = la === 0x1c01 ? 0x46b0 : la === 0x4001 ? 0x6c41 : la;   // without runtime the file starts at the header
  const H = hdrAt - la + 2;
  let a = 0x2f; const keys = [];
  for (let i = 0; i < 6; i++) { a ^= c[H + 12 + i]; keys.push(a); }
  const ent = (c[H + 6] ^ 0x79) | (c[H + 7] ^ 0x79) << 8;
  const hdr = hdrAt + 18;
  const pad = Array.from(c.subarray(H + 18, H + 18 + (ent - hdr)));
  return { keys, pad };
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
  const rt = new Runtime(blitz || blitzImage(), {
    files: { [name]: source },
    ...menuInput(opts.runtime !== false, !!opts.fullSyntax, name),
    rnd, maxSteps: opts.maxSteps, onEvent,
  });
  if (onEvent) onEvent({ type: 'start', total: lines.length });
  rt.init(VARS);
  run(rt);
  const get = n => rt.files.has(n) ? Uint8Array.from(rt.files.get(n)) : null;
  return {
    c: get('C/' + name), z: get('Z/' + name),
    errors: rt.v.X1_f + rt.v.X3_f, extensions: rt.v.X0_f,
    screen: rt.screen, messages: rt.messages, files: rt.files,
  };
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
  return programs.map((p, index) => {
    const runtime = p.runtime !== false;
    if (onEvent) onEvent({ type: 'program', index, count: programs.length, name: names[index], runtime });
    try {
      const r = compile(p.src, blitz || null, { ...opts, name: names[index], runtime, onEvent });
      return { name: names[index], runtime, c: r.c, z: r.z, errors: r.errors, extensions: r.extensions };
    } catch (e) {
      if (onEvent) onEvent({ type: 'message', text: names[index] + ': ' + e.message });
      return { name: names[index], runtime, c: null, z: null, errors: 1, extensions: 0, error: e.message };
    }
  });
}

// All outputs of compileMany() as .d81 image: C/NAME and Z/NAME per program.
export function d81Of(results, diskName = 'BLITZC') {
  const files = [];
  for (const r of results) { if (r.c) files.push({ name: 'C/' + r.name, data: r.c }); if (r.z) files.push({ name: 'Z/' + r.name, data: r.z }); }
  return makeD81(diskName, '01', files);
}

// One job as a message stream, for a Web Worker (js/worker.js) or the page itself.
// job = {programs: [{src, name, runtime}], blitz|null, like|null, fullSyntax}  (old form {src, name, runtime, ...} still works)
//   post gets the compile() events plus {type:'program', ...} and finally
//   {type:'done', results: [{name, runtime, c, z, errors, extensions, error?}], d81: Uint8Array|null, errors, extensions}  or  {type:'error', text}
export function compileJob(job, post) {
  try {
    const programs = job.programs || [{ src: job.src, name: job.name, runtime: job.runtime }];
    const results = compileMany(programs, job.blitz, { fullSyntax: job.fullSyntax, ...(job.like ? keysOf(job.like) : {}) }, post);
    const sum = k => results.reduce((a, r) => a + (r[k] || 0), 0);
    post({ type: 'done', results, d81: results.length > 1 ? d81Of(results) : null, errors: sum('errors'), extensions: sum('extensions'),
           c: results[0].c, z: results[0].z });
  } catch (e) { post({ type: 'error', text: e.message }); }
}
