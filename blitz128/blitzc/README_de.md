[English](README.md) · **Deutsch**

# blitzc – Nachbau des Blitz! 128 Compilers (Skyles, V860929)

> **Korrigierte Fassung V261117.** Die originale `BLITZ!.128` (V860929) ist 10 Bytes zu kurz; Programme mit Grafikbefehlen (Runtime `$4001`) enthalten dadurch RAM-Müll statt des Tabellenendes (CIRCLE, PAINT, BOX, `$44`) und der Konstante PI. `tools/patch_blitz128.py` hängt die fehlenden Bytes an (`fixed/blitz!.128.prg`, Version V261117); dieser Port bettet die korrigierte Fassung ein.

Ziel: Der Compiler läuft ohne Emulator (Node und Browser). Eingabe ist ein getokentes BASIC-7-PRG, Ausgabe `C/`, `Z/` und `D/`, byte-identisch zum Original bei denselben sechs Zufallsschlüsseln.

## Stand
- `oracle/`: Original-Compiler headless in VICE 3.9 (Prüfstein)
  - `build-vice.sh` baut x128/c1541/petcat ohne root nach `~/vice`
  - `compile.sh in.prg outdir` erzeugt `c.prg z.prg [d.prg]`, `screen.txt`, `keys.txt`
- `tools/keys.py`: liest die 6 Schlüssel aus einer `C/`-Datei
- `tools/runimg.py`: Runtime-Abbild „wie ausgeführt“ (Patcher entschlüsselt und angewendet)
- `tests/src/*.bas|prg`, `tests/expected/<name>/`: Referenzausgaben des Originals

## Befunde (siehe ../analysis/BLITZ128_ANALYSE_de.md, Abschnitt 11)
- Die Schlüssel werden pro Compile zufällig gewählt, abhängig vom Timing. Im Emulator sind sie bei gleichem Tasten-Timing deterministisch.
- Erster Menüpunkt `1` = Single Drive, „no COLLISION command“. Danach fragt der Compiler nach dem Programmnamen und kompiliert sofort.

## Decompiler (Stand 15.11.2026)
- `tools/bcdis.py`: Opcode-Tabelle (Längen aus `tools/oplen.py`, abstrakte Interpretation der Runtime-Handler). Sie zerlegt alle Korpuszeilen exakt (`tools/checklen.py`) und trifft alle 2 496 im VICE-Trace ausgeführten Adressen des Compilers.
- `tools/decomp.py c.prg`: Bytecode wird zu Pseudo-BASIC (Infix, Variablennamen, Sprungmarken `Lxxxx`, DATA-Tabelle).
- `compiler_decomp.bas`: der zurückgewonnene Compiler. Code `$50F8–$9F72`, 121 Variablen, DATA-Tabelle `$46CA` = 6502-Maschinencode-Routinen (Zeilen 63500 ff., per POKE geladen, Einsprung über `SYS M%`/`SYS 5872`).

Format-Notizen:
- DATA-Tabelle: Einträge `len, text, zeile_lo, zeile_hi`, XOR Schlüssel 5, Ende `$FF`.
- Sprungziele: 2 Bytes Hi/Lo, roh XOR Schlüssel 3/4. IF-Skip `1F nn` ist relativ.
- `Z/` enthält nicht alle Zeilen (Zeilen mit DO am Programmanfang fehlen), noch klären.
- Programme mit Grafikbefehlen werden als `$4001`-Variante erzeugt (Header bei `$6C41`).

## JS-Portierung (Stand 15.11.2026)

`js/` enthält den Compiler als eigenständiges Programm für Node und Browser. **Alle 51 Referenzläufe sind byte-identisch zum Original (C/ und Z/)**, in allen vier Varianten (mit/ohne Runtime × eingeschränkte/volle RESUME/COLLISION-Syntax), darunter CRAWL, alle LIVE-Quellen der D81 (bis 56 KB Quelltext, 45 KB C/), Fehlerfälle, Direktiven, `$4001`-Variante, 80 Gleitkommakonstanten.

```
node js/cli.js prog.prg out/                      # zufällige Schlüssel wie das Original
node js/cli.js prog.prg out/ --no-runtime --full  # ohne Runtime, volle RESUME/COLLISION-Syntax
node js/cli.js prog.prg out/ --like ref/c.prg     # Schlüssel+Füllbytes aus einer Original-C/-Datei
node js/test.js                                   # alle tests/expected nachbauen und vergleichen
bash oracle/compare.sh x.prg ...                  # Original (VICE) gegen Port, gleiche Schlüssel
MODE=65 bash oracle/compare.sh x.prg             # Modus: 1, 4 (volle Syntax), 35 (ohne Runtime), 65 (beides)
```
Mehrere Programme (Stand 17.11.2026): `--plain a.prg,b.prg` kompiliert weitere Programme **ohne Runtime** (sie laufen hinter dem Programm mit Runtime, das zuerst kommt; `-` statt `<in.prg>` = keines), `--d81 out.d81` schreibt alle `C/`- und `Z/`-Dateien auf ein 1581-Image. Ausgabe dann `c-<name>.prg`, `z-<name>.prg`. API: `compileMany([{src,name,runtime}], blitz, opts)`, `d81Of(results)` (`js/d81.js`). `D/` und `P/` sind Zwischendateien, die der Compiler am Ende selbst löscht, sie gehören nicht zur Ausgabe.
```
node js/cli.js crawl.prg out/ --plain lib1.prg,lib2.prg --d81 out/all.d81
```
Browser: `js/blitzc.html` direkt öffnen (eine Datei, gebaut mit `tools/bundle.py`; `js/index.html` ist die Modul-Fassung für einen Webserver). API: `compile(srcPrg, blitzPrg|null, {name, runtime, fullSyntax, keys, pad})` (null = eingebettete BLITZ!.128 aus `js/blitzimg.js`, erzeugt mit `tools/embed.py`) aus `js/blitzc.js` → `{c, z, errors, screen}`.

Aufbau:
- `tools/bc2js.py` übersetzt den **Bytecode des Compilers** (nicht das Pseudo-BASIC) nach `js/compiler.gen.js`: ein `case` pro Sprungziel, Label = Originaladresse. Damit entfallen die Anzeigefehler von `compiler_decomp.bas` (`?`, `ARRn(a,b,…)`): alle Arrays sind eindimensional, FOR/GET/READ/INPUT nehmen die zuletzt geladene Variable als Referenz, `X58` = `IF x THEN RETURN`, POKE/OPEN mit umgekehrter Argumentfolge.
- `js/rt.js`: BASIC-Primitiven, 1581-Simulation (Kanäle, Befehlskanal, Scratch, Status), Tastatur (Menü `1`, Programmname), DATA-Tabelle, native Fassungen der Maschinencode-Helfer: `SYS 288/291` Tokenizer, `SYS 5872` Zeile lesen, `SYS 5960/5985` Byte lesen/schreiben (Schlüssel bei `$1769`), `SYS 6012` Suche in Integer-Array, `SYS 5816` Speicherblock schreiben.
- Die Runtime in C/ kommt aus BLITZ!.128 selbst; die Datei ist als Base64 eingebettet (`js/blitzimg.js`), eine eigene kann man in der CLI mit `--blitz` angeben (die Browser-Seite nutzt immer die eingebettete) (Image 1 mit den zur Laufzeit gepatchten Compiler-Schlüsseln, Image 2 ab `$A065` plus 10 Bytes RAM-Muster `00 00 00 FF FF FF FF 00 00 00`).

Befunde aus der Portierung:
- Zufall: RND(0) wird nur für die 6 Schlüssel (Reihenfolge W1,W3,W4,W5,W6,W2), für J% (0–9 Füllbytes hinter dem Header) und die Füllbytes selbst gezogen. `keysOf()` liest alles aus einer C/-Datei zurück.
- `$1D00` in C/ ist der Puffer, den VAL (String-Kopie ohne Endnull, max. 160 Bytes) und INPUT# (mit Endnull) benutzen. Er enthält die letzte Statuszeile `00, OK,00,00` und ggf. Reste einer langen Konstante.
- Gleitkommakonstanten: VAL ist eine Blitz-eigene Routine (`$4314`), die Ziffern 16-bittig sammelt und dann Rechenroutinen im C128-BASIC-ROM ruft (×10, ÷10, Addition, Runden). `js/cbmfloat.js` überträgt diesen Code samt ROM-Routinen Befehl für Befehl mit Carry-Flag nach JS; **kein ROM nötig**. Geprüft mit `node tools/fincheck.mjs 500000`: 500 000 Zufallszahlen gegen den Originalcode auf dem 6502-Kern (`js/cpu6502.js`, braucht dafür das BASIC-ROM hi 318019-04 aus VICE), 0 Abweichungen.
- Orakel: große Quellen brauchen mehr Frames, z. B. `FRAMES=40000 TMO=580 CYCLES=9000000000`.
- `Z/` ist ein BASIC-Programm (Ladeadresse `$0401`): je Zeile `04 08`, Adresse als Zeilennummer, Text `= nnn `.
- Varianten: volle RESUME/COLLISION-Syntax = Menü 4–6 (`TA%=2`), ohne Runtime = zweites Menü Punkt 5 (`T9%=1`), das nur bei Dual Drive oder zwei Laufwerken erscheint. Der Port bedient intern Menü 1/4 bzw. 3/6 mit Geräten 8→9; das Laufwerkssetup hat sonst keinen Einfluss. C/ ohne Runtime beginnt direkt mit dem Header (Ladeadresse `$46B0` bzw. `$6C41`). Testnamen: `<name>.m4`, `.m35`, `.m65`.

### Textausgabe im Browser (Stand 16.11.2026)
`js/blitzc.html` zeigt nicht mehr den rohen C128-Bildschirmtext, sondern drei Fortschrittszeilen (PASS0/PASS1/PASS2: Balken, Prozent, letzte Zeilennummer) und eine scrollbare, nur lesbare Textarea für alle übrigen Meldungen (`?extensions in N`, Fehler, Zusammenfassung). Menü- und Titeltext entfallen.
- `rt.js` übersetzt die Cursor-Ausgabe des Compilers (HOME/DOWN + Zahl = aktuelle Zeile, `PASSn`, Meldungszeilen) in Ereignisse; `compile(..., {onEvent})` ergänzt Position und Gesamtzahl der Quellzeilen (`sourceLines()`), `r.messages` liefert die Meldungen, `r.screen` bleibt unverändert.
- Ereignisse: `start`, `pass`, `progress {pass,line,index,total}`, `message {text}`. PASS0 läuft nur im Mehrprogramm-Modus (T8), der Port bedient nur Einzelprogramme.
- Die Seite kompiliert in einem Web Worker (`js/worker.js`; in `blitzc.html` per Blob-URL, geht auch von `file://`), damit der Fortschritt live erscheint; ohne Worker läuft derselbe Code in der Seite.

### Mehrere Programme im Browser (Stand 17.11.2026)
Das Feld „Programm mit Runtime“ bleibt; darunter steht die Liste „Programme ohne Runtime“ (mehrere Dateien auf einmal hinzufügbar, Name je Eintrag änderbar, Entfernen). Enthält die Liste ein Element, darf das Runtime-Feld leer bleiben. Reihenfolge: Runtime-Programm zuerst. Optionen (volle Syntax, Referenzdatei) gelten für alle. Ausgabe: je Programm `c-…` und `z-…` einzeln, bei mehreren Programmen zusätzlich ein `.d81` mit `C/NAME` und `Z/NAME`. Namen: höchstens 14 Zeichen, Dubletten werden nummeriert. Ein fehlerhaftes Programm hält die anderen nicht auf. `node js/test.js` prüft zusätzlich, dass Mehrfachläufe gleich den Einzelläufen sind.

## Overlay-Modus („Gemeinsame Variablentabelle“, Menüpunkt 4 des Originals)
Alle Programme werden in **einem Lauf** übersetzt wie mit Menüpunkt 4 des Originals („alle Programme ... mit Overlay-Funktion“): der Compiler läuft zuerst mit
PASS0 über alle Programme und gibt jedem Modul **dieselbe Variablennamen-Tabelle** (Vereinigung, Reihenfolge des ersten Auftretens über alle Programme). Werden die Module mit
`LOAD "NAME",8` verkettet (nicht mit `RUN`, das Variablen immer löscht), bleiben die Variablen von Modul zu Modul erhalten. Das erste Modul enthält die Runtime,
die anderen starten dahinter. Die Ausgabedateien heißen wie die Programme (kein `C/`-Präfix, keine `Z/`-Datei), genau wie beim Original.
```
node js/cli.js a.prg out/ --plain b.prg,c.prg --overlay [--full] [--d81 out/all.d81]    # out/a.prg, b.prg, c.prg
```
API: `compileOverlay([{src, name}, ...], blitz|null, {fullSyntax, keys, pads}, onEvent)`. Browser-Seite: Checkbox **Gemeinsame Variablentabelle** (standardmäßig an, nur aktiv bei mindestens
zwei Programmen; aus = jedes Programm einzeln mit `C/NAME` und `Z/NAME` wie bisher). Der Port fährt den übersetzten Original-Compiler durch sein Menü (Quelldiskette = Gerät 8 mit allen
Programmen, leere Zieldiskette = Gerät 9); PASS0 und das Zusammenführen der Tabelle ist also der Original-Code. `tests/overlay/` enthält Referenzen, die mit dem Original-Compiler in VICE erzeugt wurden.
