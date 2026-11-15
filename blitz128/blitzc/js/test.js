// node js/test.js  - rebuild every tests/expected/<name> with the reference keys and compare byte by byte
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { findBasicRom } from './rom.js';
import { compile, keysOf } from './blitzc.js';
const here = new URL('..', import.meta.url).pathname;
const blitz = readFileSync(here + '../blitz!.128.prg');
let fail = 0;
const basicRom = findBasicRom();
if (!basicRom) console.log('note: no C128 BASIC ROM found, float constants use the approximation');
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
  try { r = compile(src, blitz, { keys, pad, basicRom, ...mode }); }
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
process.exit(fail ? 1 : 0);
