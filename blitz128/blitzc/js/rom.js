// Locate the C128 BASIC hi ROM (318019-04, 16 KB) for bit-exact float constants (Node only).
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
export function findBasicRom(path) {
  const c = [path, process.env.BLITZ_BASICROM,
    homedir() + '/vice/inst/share/vice/C128/basichi-318019-04.bin',
    '/usr/share/vice/C128/basichi-318019-04.bin', '/usr/lib/vice/C128/basichi-318019-04.bin'].filter(Boolean);
  for (const p of c) if (existsSync(p)) { const b = readFileSync(p); if (b.length === 16384) return b; }
  return null;
}
