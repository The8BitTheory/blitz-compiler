#!/usr/bin/env node
// blitzc - Blitz!128 compiler port, command line.
//   node js/cli.js <in.prg> <outdir> [--no-runtime] [--full] [--blitz BLITZ!.128.prg] [--name PROG] [--like ref_c.prg] [--keys 7b,cb,84,6d,96,a8 --pad 8b,eb,..]
//   --plain a.prg,b.prg: further programs, always compiled WITHOUT runtime (<in.prg> may then be '-' = none); --d81 out.d81: all C/ and Z/ files as disk image
//   --no-runtime: C/ without runtime routines; --full: RESUME and COLLISION with full syntax (original menu 4-6)
// Writes <outdir>/c.prg and z.prg (and screen.txt). --like takes keys and padding from a reference C/ file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { compile, compileMany, d81Of, keysOf, validKey } from './blitzc.js';
import { basename } from 'node:path';

const a = process.argv.slice(2); const opt = {}; const pos = [];
const FLAGS = ['no-runtime', 'full'];
const stem = f => basename(f).replace(/\.[^.]*$/, '').toUpperCase();
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) opt[a[i].slice(2)] = FLAGS.includes(a[i].slice(2)) ? true : a[++i]; else pos.push(a[i]);
if (pos.length < 2) { console.error('usage: cli.js in.prg outdir [--no-runtime] [--full] [--blitz file] [--name N] [--like c.prg | --keys k0,..,k5 [--pad b,..]]'); process.exit(2); }
const blitz = opt.blitz ? readFileSync(opt.blitz) : null;   // default: embedded BLITZ!.128
const hex = s => s.split(',').filter(Boolean).map(x => parseInt(x, 16));
let keys, pad;
if (opt.like) ({ keys, pad } = keysOf(readFileSync(opt.like)));
if (opt.keys) { keys = hex(opt.keys); pad = hex(opt.pad || ''); }
if (keys && !keys.every(validKey)) console.error('warning: original never produces keys with a zero nibble');
const common = { keys, pad, fullSyntax: !!opt.full };
const plain = (opt.plain || '').split(',').filter(Boolean);
mkdirSync(pos[1], { recursive: true });
if (plain.length || opt.d81) {
  // several programs: <outdir>/c-<name>.prg, z-<name>.prg; first with runtime (unless '-'), the --plain ones without
  const progs = [];
  if (pos[0] !== '-') progs.push({ src: readFileSync(pos[0]), name: opt.name || stem(pos[0]), runtime: !opt['no-runtime'] });
  for (const f of plain) progs.push({ src: readFileSync(f), name: stem(f), runtime: false });
  const res = compileMany(progs, blitz, common, ev => { if (ev.type === 'program') console.log(`${ev.index + 1}/${ev.count} ${ev.name} (${ev.runtime ? 'with' : 'without'} runtime)`); });
  let bad = 0;
  for (const x of res) {
    if (x.c) writeFileSync(`${pos[1]}/c-${x.name.toLowerCase()}.prg`, x.c);
    if (x.z) writeFileSync(`${pos[1]}/z-${x.name.toLowerCase()}.prg`, x.z);
    console.log(`  ${x.name}: errors ${x.errors}  C/ ${x.c ? x.c.length : '-'} B  Z/ ${x.z ? x.z.length : '-'} B${x.error ? '  ' + x.error : ''}`);
    bad += x.errors;
  }
  if (opt.d81) writeFileSync(opt.d81, d81Of(res));
  process.exit(bad ? 1 : 0);
}
const r = compile(readFileSync(pos[0]), blitz, { name: opt.name || 'PROG', ...common, runtime: !opt['no-runtime'] });
if (r.c) writeFileSync(pos[1] + '/c.prg', r.c);
if (r.z) writeFileSync(pos[1] + '/z.prg', r.z);
writeFileSync(pos[1] + '/screen.txt', r.screen);
console.log(`errors: ${r.errors}  extensions: ${r.extensions}  C/ ${r.c ? r.c.length : '-'} B  Z/ ${r.z ? r.z.length : '-'} B`);
process.exit(r.errors ? 1 : 0);
