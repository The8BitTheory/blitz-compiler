#!/usr/bin/env node
// blitzc - Blitz!128 compiler port, command line.
//   node js/cli.js <in.prg> <outdir> [--no-runtime] [--full] [--blitz BLITZ!.128.prg] [--name PROG] [--like ref_c.prg] [--keys 7b,cb,84,6d,96,a8 --pad 8b,eb,..]
//   --no-runtime: C/ without runtime routines; --full: RESUME and COLLISION with full syntax (original menu 4-6)
// Writes <outdir>/c.prg and z.prg (and screen.txt). --like takes keys and padding from a reference C/ file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { compile, keysOf, validKey } from './blitzc.js';

const a = process.argv.slice(2); const opt = {}; const pos = [];
const FLAGS = ['no-runtime', 'full'];
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) opt[a[i].slice(2)] = FLAGS.includes(a[i].slice(2)) ? true : a[++i]; else pos.push(a[i]);
if (pos.length < 2) { console.error('usage: cli.js in.prg outdir [--no-runtime] [--full] [--blitz file] [--name N] [--like c.prg | --keys k0,..,k5 [--pad b,..]]'); process.exit(2); }
const blitz = opt.blitz ? readFileSync(opt.blitz) : null;   // default: embedded BLITZ!.128
const hex = s => s.split(',').filter(Boolean).map(x => parseInt(x, 16));
let keys, pad;
if (opt.like) ({ keys, pad } = keysOf(readFileSync(opt.like)));
if (opt.keys) { keys = hex(opt.keys); pad = hex(opt.pad || ''); }
if (keys && !keys.every(validKey)) console.error('warning: original never produces keys with a zero nibble');
const r = compile(readFileSync(pos[0]), blitz, { name: opt.name || 'PROG', keys, pad, runtime: !opt['no-runtime'], fullSyntax: !!opt.full });
mkdirSync(pos[1], { recursive: true });
if (r.c) writeFileSync(pos[1] + '/c.prg', r.c);
if (r.z) writeFileSync(pos[1] + '/z.prg', r.z);
writeFileSync(pos[1] + '/screen.txt', r.screen);
console.log(`errors: ${r.errors}  extensions: ${r.extensions}  C/ ${r.c ? r.c.length : '-'} B  Z/ ${r.z ? r.z.length : '-'} B`);
process.exit(r.errors ? 1 : 0);
