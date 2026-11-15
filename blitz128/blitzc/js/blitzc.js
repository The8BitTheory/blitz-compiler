// Blitz!128 compiler port - public API (Node and browser, no dependencies).
//
//   import { compile } from './blitzc.js';
//   const r = compile(sourcePrg, blitzPrg, { name: 'PROG', runtime: true, fullSyntax: false, keys, pad });
//   runtime:    false = C/ without runtime routines (original menu: two drives, then 5)
//   fullSyntax: true  = "RESUME and COLLISION with full syntax" (original menu 4-6), else
//               "no COLLISION command, RESUME with linenumber only" (menu 1-3)
//   r.c  -> C/NAME (Uint8Array), r.z -> Z/NAME, r.errors, r.screen
//
// blitzPrg is the original BLITZ!.128 file: its runtime images are copied into
// every C/ file, exactly like the original does from memory.
import { run, VARS } from './compiler.gen.js';
import { Runtime } from './rt.js';

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

export function compile(source, blitz, opts = {}) {
  const name = petscii(opts.name || 'PROG');
  let rnd = null;
  if (opts.keys) rnd = rndFor(opts.keys, opts.pad || []);
  const rt = new Runtime(blitz, {
    files: { [name]: source },
    ...menuInput(opts.runtime !== false, !!opts.fullSyntax, name),
    rnd, maxSteps: opts.maxSteps,
  });
  rt.init(VARS);
  run(rt);
  const get = n => rt.files.has(n) ? Uint8Array.from(rt.files.get(n)) : null;
  return {
    c: get('C/' + name), z: get('Z/' + name),
    errors: rt.v.X1_f + rt.v.X3_f, extensions: rt.v.X0_f,
    screen: rt.screen, files: rt.files,
  };
}
