// node js/test.js  - rebuild every tests/expected/<name> with the reference keys and compare byte by byte
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { compile, compileMany, compileJob, d81Of, diskNames, keysOf, blitzImage } from './blitzc.js';
const here = new URL('..', import.meta.url).pathname;
const blitz = blitzImage('fixed');   // the references need the fixed build (V261123): 10-byte fix + FAST/SLOW delta (fixRef)
// The references were made with the original V860929 runtime.  The embedded build (V261123) also carries the FAST/SLOW fix
// (tools/patch_blitz128.py): two bytes in each runtime image.  Apply that known delta to a reference before comparing.
function fixRef(b) {
  b = Uint8Array.from(b); const la = b[0] | b[1] << 8;
  const put = (addr, lo, hi) => { const i = addr - la + 2; if (i >= 2 && i + 1 < b.length) { b[i] = lo; b[i + 1] = hi; } };
  if (la === 0x1c01) put(0x3dc2, 0xf4, 0x3d);
  if (la === 0x4001) put(0x6353, 0x85, 0x63);
  return b;
}
let fail = 0;
const only = process.argv[2];
for (const t of readdirSync(here + 'tests/expected').sort()) {
  if (only && t !== only) continue;
  const ex = here + 'tests/expected/' + t + '/';
  // <name>.m4 = full syntax, .m35 = without runtime, .m65 = both (original menu keys)
  const [base, m] = t.split('.m'); const mode = { runtime: !(m === '35' || m === '65'), fullSyntax: m === '4' || m === '65' };
  const src = readFileSync(here + 'tests/src/' + base + '.prg');
  const ec = fixRef(readFileSync(ex + 'c.prg')); const ez = existsSync(ex + 'z.prg') ? readFileSync(ex + 'z.prg') : null;
  const { keys, pad } = keysOf(ec);
  let r;
  try { r = compile(src, blitz, { keys, pad, ...mode }); }
  catch (e) { console.log('FAIL', t, 'exception', e.message); fail++; continue; }
  const cmp = (a, b, what) => {
    if (!a || !b) return `${what}: missing (${!!a}/${!!b})`;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) {
      const la = b[0] | b[1] << 8;
      return `${what}: first diff at $${(la + i - 2).toString(16)} (got ${a[i].toString(16)} want ${b[i].toString(16)}), len ${a.length}/${b.length}`;
    }
    return a.length === b.length ? null : `${what}: length ${a.length} vs ${b.length}`;
  };
  const errs = [cmp(r.c, ec, 'C/'), ez ? cmp(r.z, ez, 'Z/') : null].filter(Boolean);
  if (errs.length) { fail++; console.log('FAIL', t, errs.join('; ')); }
  else console.log('ok  ', t, `C/ ${r.c.length} B, Z/ ${r.z ? r.z.length : 0} B, errors ${r.errors}`);
}

// several programs in one go: first with runtime, the rest without; each result equals the single compile
if (!only) {
  const src = n => readFileSync(here + 'tests/src/' + n + '.prg');
  const { keys, pad } = keysOf(readFileSync(here + 'tests/expected/CRAWL/c.prg'));
  const progs = [{ src: src('CRAWL'), name: 'CRAWL', runtime: true }, { src: src('t1'), name: 't1', runtime: false }, { src: src('stmt1'), name: 'T1', runtime: false }];
  const events = [];
  const res = compileMany(progs, null, { keys, pad }, e => { if (e.type === 'program') events.push(e.name + (e.runtime ? '+' : '-')); });
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  const bad = [];
  if (events.join() !== 'CRAWL+,T1-,T12-') bad.push('program events ' + events.join());   // names upper case, duplicates numbered
  [['CRAWL', true, 'CRAWL'], ['t1', false, 'T1'], ['stmt1', false, 'T12']].forEach(([f, rt, nm], i) => {
    const one = compile(src(f), null, { keys, pad, runtime: rt, name: nm });
    if (!same(res[i].c, one.c) || !same(res[i].z, one.z)) bad.push(nm + ': multi result differs from single compile');
  });
  const la = r => r.c[0] | r.c[1] << 8;
  if ((la(res[0]) !== 0x1c01 && la(res[0]) !== 0x4001) || la(res[1]) !== 0x46b0 || la(res[2]) !== 0x46b0) bad.push('load addresses ' + res.map(r => la(r).toString(16)));
  const img = d81Of(res);
  if (img.length !== 819200 || img[40 * 40 * 256 - 40 * 256 + 2] !== 0x44) bad.push('d81 header');
  // job form as the worker sees it
  let done; compileJob({ programs: progs, blitz: null, like: readFileSync(here + 'tests/expected/CRAWL/c.prg'), fullSyntax: false }, m => { if (m.type === 'done') done = m; });
  if (!done || done.results.length !== 3 || !same(done.d81, img)) bad.push('compileJob result');
  if (diskNames(['a very long program name', 'a very long program name']).join() !== 'A VERY LONG PR,A VERY LONG P2') bad.push('diskNames ' + diskNames(['a very long program name', 'a very long program name']));
  writeFileSyncIf(process.env.D81_OUT, img);
  if (bad.length) { fail++; console.log('FAIL multi', bad.join('; ')); } else console.log('ok   multi (3 programs, d81 ' + img.length + ' B)');
}

// overlay mode (original menu item 4): tests/overlay/<case>/ {case.json, src/<name>.prg, expected/<name>.prg}; keys and padding come from the references
{
  const { compileOverlay } = await import('./blitzc.js');
  const od = here + 'tests/overlay/';
  for (const t of existsSync(od) ? readdirSync(od).sort() : []) {
    if (only && !t.startsWith(only)) continue;
    const cfg = JSON.parse(readFileSync(od + t + '/case.json', 'utf8'));
    const progs = cfg.order.map(n => ({ name: n, src: readFileSync(od + t + '/src/' + n + '.prg') }));
    const exp = cfg.order.map(n => fixRef(readFileSync(od + t + '/expected/' + n + '.prg')));
    const ks = exp.map(keysOf);
    let r;
    try { r = compileOverlay(progs, blitz, { fullSyntax: cfg.full, keys: ks[0].keys, pads: ks.map(k => k.pad) }); }
    catch (e) { console.log('FAIL overlay', t, 'exception', e.message); fail++; continue; }
    const errs = [];
    r.forEach((x, i) => {
      const a = x.c, b = exp[i];
      if (!a) { errs.push(x.name + ': missing'); return; }
      const n = Math.min(a.length, b.length);
      for (let k = 0; k < n; k++) if (a[k] !== b[k]) { errs.push(`${x.name}: first diff at offset ${k} (got ${a[k].toString(16)} want ${b[k].toString(16)})`); return; }
      if (a.length !== b.length) errs.push(`${x.name}: length ${a.length} vs ${b.length}`);
    });
    if (errs.length) { fail++; console.log('FAIL overlay', t, errs.join('; ')); }
    else console.log('ok   overlay ' + t, r.map(x => `${x.name} ${x.c.length} B`).join(', '));
  }
}
// Improved 2026 runtime: detection, key round trip (keysOf -> compile gives the same file), automatic fast math, $FC00 limit
if (!only) {
  const { usesMath, runtimeKindOf } = await import('./blitzc.js');
  const bad = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  for (const n of ['t1', 'expr', 'floats', 'CRAWL', 'LIVE10WORK']) {
    const src = readFileSync(here + 'tests/src/' + n + '.prg');
    for (const fastMath of ['auto', true, false]) {
      const a = compile(src, null, { runtimeKind: 'improved', fastMath });
      const want = fastMath === 'auto' ? usesMath(src) : fastMath;
      if (a.fastMath !== want) bad.push(`${n} ${fastMath}: fastMath ${a.fastMath}`);
      if (runtimeKindOf(a.c) !== (want ? 'improved+fastmath' : 'improved')) bad.push(`${n} ${fastMath}: runtimeKindOf ${runtimeKindOf(a.c)}`);
      const b = compile(src, null, { runtimeKind: 'improved', fastMath, ...keysOf(a.c) });
      if (!same(a.c, b.c) || !same(a.z, b.z)) bad.push(`${n} ${fastMath}: keysOf round trip differs`);
    }
  }
  if (usesMath(readFileSync(here + 'tests/src/t1.prg')) !== true || usesMath(readFileSync(here + 'tests/src/stmt1.prg')) !== false) bad.push('usesMath t1/stmt1');
  try { compile(readFileSync(here + 'tests/src/LIVE10WORK.prg'), null, { runtimeKind: 'improved' }); } catch (e) { bad.push('LIVE10WORK: ' + e.message); }
  if (bad.length) { fail++; console.log('FAIL improved', bad.join('; ')); } else console.log('ok   improved runtime (detection, key round trip, fast math choice)');
}
// Fixed original runtime: the original runtime with all bug fixes and nothing else (no extension block, same size as the original)
if (!only) {
  const bad = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  const { runtimeKindOf } = await import('./blitzc.js');
  for (const n of ['t1', 'CRAWL', 'LIVE10WORK', 'ri1', 'ri2']) {
    const src = readFileSync(here + 'tests/src/' + n + '.prg');
    const o = compile(src, null, { runtimeKind: 'original' });
    const f = compile(src, null, { runtimeKind: 'fixed', ...keysOf(o.c) });
    const ref = compile(src, blitzImage('fixed'), keysOf(o.c));      // the fixed build as the references use it
    if (f.runtimeKind !== 'fixed') bad.push(`${n}: runtimeKind ${f.runtimeKind}`);
    if (runtimeKindOf(f.c) !== 'fixed') bad.push(`${n}: runtimeKindOf fixed -> ${runtimeKindOf(f.c)}`);
    if (runtimeKindOf(o.c) !== 'original') bad.push(`${n}: runtimeKindOf original -> ${runtimeKindOf(o.c)}`);
    if (!same(f.c, ref.c) || !same(f.z, ref.z)) bad.push(`${n}: differs from the fixed build output`);
    if (f.c.length !== o.c.length) bad.push(`${n}: size ${f.c.length} vs original ${o.c.length}`);   // no extension block
    // against the original only the known fixes differ: FAST/SLOW operand (2 bytes per image) and, in image 2, the truncated tail (10 bytes)
    let d = 0; for (let i = 0; i < f.c.length; i++) if (f.c[i] !== o.c[i]) d++;
    if (d === 0 || d > 12) bad.push(`${n}: ${d} bytes differ from the original (expected 2, or 12 with graphics)`);
    if (n === 'ri2' && f.c[0x40ff - 0x4001 + 2] !== 77) bad.push('ri2: **RI byte missing');
  }
  if (bad.length) { fail++; console.log('FAIL fixed runtime', bad.join('; ')); } else console.log('ok   fixed original runtime (only the fixes differ from the original)');
}
// **RI n: the runtime reads the trampoline length at offset $FE of its image ($1CFF for image 1, $40FF for image 2 = graphics programs).
// The original compiler writes the image-2 value to the wrong place ($40FF stays 0); the JS port fixes that (tools/bc2js.py).
if (!only) {
  const bad = [];
  for (const kind of ['original', 'fixed', 'improved'])
    for (const [n, la, at] of [['ri1', 0x1c01, 0x1cff], ['ri2', 0x4001, 0x40ff]]) {
      const r = compile(readFileSync(here + 'tests/src/' + n + '.prg'), null, { runtimeKind: kind });
      const got = r.c[0] | r.c[1] << 8;
      if (got !== la) bad.push(`${kind} ${n}: load address $${got.toString(16)}`);
      else if (r.c[at - la + 2] !== 77) bad.push(`${kind} ${n}: $${at.toString(16)} = ${r.c[at - la + 2]}, want 77`);
    }
  if (bad.length) { fail++; console.log('FAIL **RI', bad.join('; ')); } else console.log('ok   **RI byte at $1CFF (image 1) / $40FF (image 2), original, fixed and improved runtime');
}
function writeFileSyncIf(f, d) { if (f) writeFileSync(f, d); }
process.exit(fail ? 1 : 0);
