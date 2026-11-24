#!/usr/bin/env python3
"""Build js/blitzc.html: one self-contained page (works from file://, no server, no Node)."""
import re, os
J = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js')
def mod(n):
    s = open(os.path.join(J, n)).read()
    s = re.sub(r'^import .*?;\s*$', '', s, flags=re.M)
    return re.sub(r'^export ', '', s, flags=re.M)
code = '\n'.join(mod(n) for n in ['blitzimg.js', 'rt2026img.js', 'cbmfloat.js', 'd81.js', 'rt.js', 'compiler.gen.js', 'blitzc.js'])
page = open(os.path.join(J, 'index.html')).read()
# the compiler code goes into a text block: the page starts a Web Worker from it (Blob URL, works from file://)
# and falls back to running it inside the page if no worker can be started
page = page.replace('<script type="module">', '<script type="text/plain" id="wsrc">\n' + code.replace('</script', '<\\/script') + '\n</script>\n<script type="module">', 1)
page = page.replace("const makeWorker = () => new Worker('./worker.js', { type: 'module' });",
  "const WSRC = document.getElementById('wsrc').textContent;\n"
  "const makeWorker = () => new Worker(URL.createObjectURL(new Blob([WSRC, '\\nonmessage = e => compileJob(e.data, m => postMessage(m));'], { type: 'text/javascript' })));")
page = page.replace("const runInline = async (job, post) => (await import('./blitzc.js')).compileJob(job, post);",
  "const runInline = async (job, post) => new Function(WSRC + '\\nreturn compileJob;')()(job, post);")
page = re.sub(r'<span id="srvhint">.*?</span>', '', page, flags=re.S)
page = page.replace('Everything runs locally in the browser.', 'Everything runs locally in the browser, and the file opens directly with a double click.')
open(os.path.join(J, 'blitzc.html'), 'w').write(page)
print('js/blitzc.html', len(page), 'bytes')
