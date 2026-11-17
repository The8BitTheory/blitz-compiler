// 1581 disk image (.d81) with PRG files, for Node and browser (port of c128-vdc-gui/tools/mkd81.py).
//   const img = makeD81('BLITZC', '01', [{name: 'C/PROG', data: Uint8Array}, ...]);   // -> Uint8Array (819200 B)
// Layout: 80 tracks x 40 sectors, header 40/0, BAM 40/1 and 40/2, directory from 40/3.
const D81_TRACKS = 80, D81_SECTORS = 40, D81_SECSIZE = 256, D81_DIR = 40;

const d81Name = (name, n = 16) => {
  const out = [];
  for (const ch of name.toUpperCase().slice(0, n)) { const o = ch.charCodeAt(0); out.push(o >= 0x20 && o < 0x60 ? o : 0x2e); }
  return Uint8Array.from(out);
};
const d81Pad = (b, n) => { const o = new Uint8Array(n).fill(0xa0); o.set(b); return o; };

export function makeD81(diskName, diskId, files) {
  const img = new Uint8Array(D81_TRACKS * D81_SECTORS * D81_SECSIZE);
  const used = Array.from({ length: D81_TRACKS + 1 }, () => new Array(D81_SECTORS).fill(false));
  for (let s = 0; s < 4; s++) used[D81_DIR][s] = true;   // header, 2x BAM, first directory sector
  const off = (t, s) => ((t - 1) * D81_SECTORS + s) * D81_SECSIZE;
  const alloc = () => {   // tracks next to the directory first: 39, 41, 38, 42, ...
    for (let d = 1; d < D81_TRACKS; d++) for (const t of [D81_DIR - d, D81_DIR + d]) {
      if (t < 1 || t > D81_TRACKS) continue;
      for (let s = 0; s < D81_SECTORS; s++) if (!used[t][s]) { used[t][s] = true; return [t, s]; }
    }
    throw new Error('Image voll');
  };
  const entries = [];
  for (const { name, data } of files) {
    const chunks = [];
    for (let i = 0; i < data.length; i += 254) chunks.push(data.subarray(i, i + 254));
    if (!chunks.length) chunks.push(new Uint8Array(0));
    const secs = chunks.map(alloc);
    chunks.forEach((c, i) => {
      const o = off(...secs[i]);
      if (i + 1 < secs.length) { img[o] = secs[i + 1][0]; img[o + 1] = secs[i + 1][1]; } else { img[o] = 0; img[o + 1] = c.length + 1; }
      img.set(c, o + 2);
    });
    entries.push({ name: d81Name(name), ts: secs[0], size: secs.length });
  }
  // directory, 8 entries per sector
  const dirSecs = [3];
  for (let s = 4; dirSecs.length < Math.ceil(entries.length / 8); s++) { used[D81_DIR][s] = true; dirSecs.push(s); }
  dirSecs.forEach((ds, i) => {
    const o = off(D81_DIR, ds);
    if (i + 1 < dirSecs.length) { img[o] = D81_DIR; img[o + 1] = dirSecs[i + 1]; } else { img[o] = 0; img[o + 1] = 0xff; }
    entries.slice(i * 8, i * 8 + 8).forEach((e, j) => {
      const p = o + j * 32;
      img[p + 2] = 0x82; img[p + 3] = e.ts[0]; img[p + 4] = e.ts[1];
      img.set(d81Pad(e.name, 16), p + 5);
      img[p + 30] = e.size & 255; img[p + 31] = e.size >> 8;
    });
  });
  // header 40/0
  let o = off(D81_DIR, 0);
  img.set([D81_DIR, 3, 0x44, 0], o);
  img.set(d81Pad(d81Name(diskName), 16), o + 4);
  img.set([0xa0, 0xa0], o + 20);
  const id = d81Pad(d81Name(diskId, 2), 2).map(b => (b === 0xa0 ? 0x30 : b));
  img.set(id, o + 22); img[o + 24] = 0xa0; img.set([0x33, 0x44, 0xa0, 0xa0], o + 25);
  // BAM 40/1 (tracks 1-40) and 40/2 (41-80)
  for (let half = 0; half < 2; half++) {
    o = off(D81_DIR, half + 1);
    img[o] = half ? 0 : D81_DIR; img[o + 1] = half ? 0xff : 2; img[o + 2] = 0x44; img[o + 3] = 0xbb;
    img.set(id, o + 4); img[o + 6] = 0xc0;
    for (let k = 0; k < 40; k++) {
      const free = used[half * 40 + k + 1].map(u => !u), e = o + 16 + k * 6;
      img[e] = free.filter(Boolean).length;
      for (let b = 0; b < 5; b++) { let v = 0; for (let bit = 0; bit < 8; bit++) if (free[b * 8 + bit]) v |= 1 << bit; img[e + 1 + b] = v; }
    }
  }
  return img;
}
