#!/usr/bin/env python3
"""Run the byte-for-byte regression (what js/test.js does) in headless Chrome, for machines without Node.
usage: chrome-test.py [chrome-binary]        (default: chrome / google-chrome / chromium on PATH)
Builds a temporary page from js/blitzc.html (the bundled compiler), feeds it every tests/src/*.prg with the keys/padding of
tests/expected/<name>/c.prg and compares C/ and Z/ with the expected files. Exit code 1 on any failure."""
import re, base64, os, glob, json, sys, subprocess, tempfile, shutil
H = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
page = open(os.path.join(H, 'js', 'blitzc.html')).read()
code = re.search(r'<script type="text/plain" id="wsrc">\n(.*?)\n</script>', page, re.S).group(1).replace('<\\/script', '</script')
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
def b64ref(p):
    # references come from the original V860929 runtime; the embedded build V261123 carries the FAST/SLOW fix (2 bytes per image)
    b = bytearray(open(p, 'rb').read()); la = b[0] | b[1] << 8
    for img_la, addr, new in ((0x1c01, 0x3dc2, b'\xf4\x3d'), (0x4001, 0x6353, b'\x85\x63')):
        i = addr - la + 2
        if la == img_la and i + 2 <= len(b): b[i:i + 2] = new
    return base64.b64encode(bytes(b)).decode()
tests = []
for d in sorted(glob.glob(os.path.join(H, 'tests', 'expected', '*'))):
    t = os.path.basename(d); base = t.split('.m')[0]
    src = os.path.join(H, 'tests', 'src', base + '.prg')
    if not (os.path.exists(os.path.join(d, 'c.prg')) and os.path.exists(src)): continue
    e = {'name': t, 'src': b64(src), 'c': b64ref(os.path.join(d, 'c.prg'))}
    if os.path.exists(os.path.join(d, 'z.prg')): e['z'] = b64(os.path.join(d, 'z.prg'))
    tests.append(e)
ov = []
for d in sorted(glob.glob(os.path.join(H, 'tests', 'overlay', '*'))):
    cfg = json.load(open(os.path.join(d, 'case.json')))
    ov.append({'name': os.path.basename(d), 'full': cfg['full'], 'order': cfg['order'],
               'src': [b64(os.path.join(d, 'src', n + '.prg')) for n in cfg['order']],
               'exp': [b64ref(os.path.join(d, 'expected', n + '.prg')) for n in cfg['order']]})
runner = '''
const b2u=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const api=new Function(WSRC+'\\nreturn {compile,keysOf,compileOverlay};')();
const T=%s; const out=[]; let fail=0;
for(const t of T){
  const [base,m]=t.name.split('.m'); const mode={runtime:!(m==='35'||m==='65'),fullSyntax:m==='4'||m==='65'};
  const ec=b2u(t.c); const {keys,pad}=api.keysOf(ec);
  let r; try{ r=api.compile(b2u(t.src),null,{keys,pad,...mode,runtimeKind:'original'}); }catch(e){ out.push('FAIL '+t.name+' exception '+e.message); fail++; continue; }
  const cmp=(a,b,w)=>{ if(!a||!b) return w+': missing'; const n=Math.min(a.length,b.length);
    for(let i=0;i<n;i++) if(a[i]!==b[i]) return w+': first diff at offset '+i+' got '+a[i].toString(16)+' want '+b[i].toString(16)+' len '+a.length+'/'+b.length;
    return a.length===b.length?null:w+': length '+a.length+' vs '+b.length; };
  const errs=[cmp(r.c,ec,'C/'), t.z?cmp(r.z,b2u(t.z),'Z/'):null].filter(Boolean);
  if(errs.length){fail++; out.push('FAIL '+t.name+' '+errs.join('; '));} else out.push('ok   '+t.name+' C/ '+r.c.length);
}
const O=%s;
for(const t of O){
  const exp=t.exp.map(b2u), ks=exp.map(api.keysOf);
  let r; try{ r=api.compileOverlay(t.order.map((n,i)=>({name:n,src:b2u(t.src[i])})),null,{runtimeKind:'original',fullSyntax:t.full,keys:ks[0].keys,pads:ks.map(k=>k.pad)}); }catch(e){ out.push('FAIL overlay '+t.name+' exception '+e.message); fail++; continue; }
  const errs=[]; r.forEach((x,i)=>{ const a=x.c,b=exp[i]; if(!a){errs.push(x.name+': missing');return;} const n=Math.min(a.length,b.length);
    for(let k=0;k<n;k++) if(a[k]!==b[k]){errs.push(x.name+': first diff at '+k);return;} if(a.length!==b.length) errs.push(x.name+': length '+a.length+' vs '+b.length); });
  if(errs.length){fail++; out.push('FAIL overlay '+t.name+' '+errs.join('; '));} else out.push('ok   overlay '+t.name+' '+r.map(x=>x.name+' '+x.c.length).join(', '));
}
document.getElementById('out').textContent=out.join('\\n')+'\\nFAILED: '+fail;
''' % (json.dumps(tests), json.dumps(ov))
html = ('<!doctype html><meta charset=utf-8><pre id=out>running</pre><script type="text/plain" id="wsrc">\n' + code.replace('</script', '<\\/script') +
        '\n</script><script>const WSRC=document.getElementById("wsrc").textContent;\n' + runner + '</script>')
chrome = sys.argv[1] if len(sys.argv) > 1 else next((shutil.which(c) for c in ('chrome', 'google-chrome', 'chromium', 'chromium-browser') if shutil.which(c)), None)
if not chrome: sys.exit('no Chrome found; pass the binary as argument')
with tempfile.TemporaryDirectory() as tmp:
    f = os.path.join(tmp, 'harness.html'); open(f, 'w').write(html)
    out = subprocess.run([chrome, '--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=250000', '--dump-dom', 'file://' + f],
                         capture_output=True, text=True, timeout=290).stdout
res = re.sub(r'<[^>]*>', '', re.search(r'<pre id="out">(.*?)</pre>', out, re.S).group(1))
print(res)
sys.exit(0 if res.rstrip().endswith('FAILED: 0') else 1)
