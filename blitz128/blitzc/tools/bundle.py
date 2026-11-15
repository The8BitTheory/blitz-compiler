#!/usr/bin/env python3
"""Build js/blitzc.html: one self-contained page (works from file://, no server, no Node)."""
import re, os
J = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js')
def mod(n):
    s = open(os.path.join(J, n)).read()
    s = re.sub(r'^import .*?;\s*$', '', s, flags=re.M)
    return re.sub(r'^export ', '', s, flags=re.M)
code = '\n'.join(mod(n) for n in ['blitzimg.js', 'cbmfloat.js', 'rt.js', 'compiler.gen.js', 'blitzc.js'])
page = open(os.path.join(J, 'index.html')).read()
page = page.replace("import { compile, keysOf } from './blitzc.js';\n", '')
page = page.replace('<script type="module">', '<script type="module">\n' + code.replace('</script', '<\\/script') + '\n', 1)
page = re.sub(r'<p>Seite über einen lokalen Webserver.*?</p>', '', page, flags=re.S)
page = page.replace('Alles läuft lokal im Browser.', 'Alles läuft lokal im Browser, die Datei lässt sich direkt per Doppelklick öffnen.')
open(os.path.join(J, 'blitzc.html'), 'w').write(page)
print('js/blitzc.html', len(page), 'bytes')
