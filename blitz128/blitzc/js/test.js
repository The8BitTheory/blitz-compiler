// node js/test.js  - rebuild every tests/expected/<name> with the reference keys and compare byte by byte
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { compile, compileMany, compileJob, d81Of, diskNames, keysOf } from './blitzc.js';
const here = new URL('..', import.meta.url).pathname;
const blitz = null;   // embedded image (js/blitzimg.js)
let fail = 0;
const only = process.argv[2];
for (const t of readdirSync(here + 'tests/expected').sort()) {
  if (only && t !== only) continue;
  const ex = here + 'tests/expected/' + t + '/';
  // <name>.m4 = full syntax, .m35 = without runtime, .m65 = both (original menu keys)
  const [base, m] = t.split('.m'); const mode = { runtime: !(m === '35' || m === '65'), fullSyntax: m === '4' || m === '65' };
  const src = readFileSync(here + 'tests/src/' + base + '.prg');
  const ec = readFileSync(ex + 'c.prg'); const ez = existsSync(ex + 'z.prg') ? readFileSync(ex + 'z.prg') : null;
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
function writeFileSyncIf(f, d) { if (f) writeFileSync(f, d); }
process.exit(fail ? 1 : 0);
