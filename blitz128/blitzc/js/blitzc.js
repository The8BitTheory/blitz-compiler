// Blitz!128 compiler port - public API (Node and browser, no dependencies).
//
//   import { compile } from './blitzc.js';
//   const r = compile(sourcePrg, blitzPrg, { name: 'PROG', keys, pad });
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
  const la = c[0] | c[1] << 8, H = (la === 0x1c01 ? 0x46b0 : 0x6c41) - la + 2;
  let a = 0x2f; const keys = [];
  for (let i = 0; i < 6; i++) { a ^= c[H + 12 + i]; keys.push(a); }
  const ent = (c[H + 6] ^ 0x79) | (c[H + 7] ^ 0x79) << 8;
  const hdr = (la === 0x1c01 ? 0x46b0 : 0x6c41) + 18;
  const pad = Array.from(c.subarray(H + 18, H + 18 + (ent - hdr)));
  return { keys, pad };
}
export function validKey(k) { return (k & 15) !== 0 && (k & 240) !== 0; }

export function compile(source, blitz, opts = {}) {
  const name = petscii(opts.name || 'PROG');
  let rnd = null;
  if (opts.keys) rnd = rndFor(opts.keys, opts.pad || []);
  const rt = new Runtime(blitz, {
    files: { [name]: source },
    keys: '1',              // menu: 1 = single drive, single program with runtime
    lines: [name],          // program name
    rnd, maxSteps: opts.maxSteps, basicRom: opts.basicRom,
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
