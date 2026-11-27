[English](README.md) · **Deutsch**

# Blitz! 128 compiler

Blitz! 128 (Skyles Electric Works, Versionsstring V860929, Handbuch 1985 von Bob Skyles) übersetzt ein tokenisiertes BASIC-7-Programm in XOR-verschleierten Bytecode plus eine kopierte Runtime (einen Bytecode-Interpreter). Dieses Verzeichnis enthält die Analyse von Compiler und Runtime, Korrekturen für die Runtime, eine schnellere Runtime und einen JavaScript-Port des Compilers, der in Node.js und im Browser läuft.

**Online-Compiler:** <https://the8bittheory.github.io/blitz-Compiler/> (alles läuft lokal im Browser; Compiler-Build vom 2026-11-24).

## Kernpunkte

- **Korrekturen an der Runtime (zwei Fehler).** (1) Image 2 (die `$4001`-Runtime für Programme mit Grafikbefehlen) ist in der `BLITZ!.128` dieses Repos 10 Bytes zu kurz: Der Compiler kopiert 11 328 Bytes, die letzten 10 sind RAM-Müll, sodass CIRCLE/PAINT/BOX in nicht initialisiertes RAM springen und PI Müll ist. (2) FAST/SLOW lassen die MMU in Konfiguration `$02`, sodass Bytecode oberhalb von `$8000` (Programme mit mehr als etwa 15 KB Bytecode) aus dem ROM gelesen wird. Beide sind in den Runtimes `fixed` und `improved` behoben; früher kompilierte Programme müssen neu kompiliert werden. Details: [fixed/README.md](fixed/README.md).
- **Korrektur am Compiler (einer).** Bei `**RI n` in Grafikprogrammen pokt der originale Compiler den Wert an die falsche Adresse (Ende seiner Image-2-Kopie + 254 statt Image-Anfang + 254), sodass die Runtime nach `::`-Erweiterungen die trampolines und den Eingabepuffer nie wiederherstellt. Der JavaScript-Compiler pokt die richtige Adresse; die Ausgabe weicht vom Original nur in diesem Byte ab und nur, wenn `**RI` benutzt wird. Das gilt für alle drei Runtime-Varianten. Der originale Compiler auf einem C128 (und der `fixed/`-Build, der nur die Runtime-Images korrigiert) hat diesen Fehler weiterhin.
- **Performance der Runtime.** Die improved Runtime führt denselben Bytecode aus und ist schneller (gemessene Zyklen von Start bis END, VICE 3.10, `perf/bench2.sh`): -9,5 % bis -20,0 % ohne fast math, reiner Float-Code nur -0,9 % und -26,1 % für Float-Code mit fast math. Kosten: Runtime +1,4 KB (plain) / +3,2 KB (fast math), 768 Bytes weniger Stringspeicher, das Programm muss unterhalb von `$FC00` enden. Siehe [perf/RUNTIME_PERF_de.md](perf/RUNTIME_PERF_de.md) ([English](perf/RUNTIME_PERF.md)) und [runtime2026/README_de.md](runtime2026/README_de.md) ([English](runtime2026/README.md)).

| Benchmark | Original | Improved | Improved + fast math (auto) |
|---|---|---|---|
| loop | 14.51 M | -17.6 % | -17.2 % |
| fi (`**FI`) | 8.05 M | -9.5 % | -8.7 % |
| float (SIN, SQR, *, /) | 29.42 M | -0.9 % | -26.1 % |
| str | 8.21 M | -12.0 % | -12.0 % |
| arr | 6.09 M | -20.0 % | -19.0 % |
| sieve | 14.54 M | -15.9 % | -15.5 % |

## Der JavaScript-Compiler (blitzc)

### Was es ist

Ein Port des Blitz!-128-Compilers nach JavaScript, in [blitzc/](blitzc/): [blitzc/js/blitzc.js](blitzc/js/blitzc.js) ist ein ES-Modul ohne Abhängigkeiten für Node.js und Browser; ein Emulator ist nicht nötig. Der Compiler-Bytecode des Originals wird von [blitzc/tools/bc2js.py](blitzc/tools/bc2js.py) nach JavaScript übersetzt. Die Ausgabe ist byte-identisch mit dem originalen Compiler (bei gleichen Keys). Ausgabedateien sind `C/NAME` (Programm) und `Z/NAME` (Adresse-zu-Zeile-Map). Weitere Dokumentation: [blitzc/README_de.md](blitzc/README_de.md) ([English](blitzc/README.md)).

### Runtime-Varianten

| Auswahl | CLI- / API-Wert | Inhalt |
|---|---|---|
| Original runtime | `original` | Unveränderte Skyles-V860929-Runtime von 1986 mit ihren Fehlern (eingebettete, unveränderte `BLITZ!.128`) |
| Fixed original runtime | `fixed` | V261123: Original Byte für Byte plus die beiden Runtime-Korrekturen; keine Beschleunigungen, gleiche Größe und Geschwindigkeit wie original |
| Improved runtime | `improved` | V261123-Korrekturen plus Beschleunigungen, optional fast math |

**Vorgabe:** CLI, Seite und JavaScript-API verwenden alle standardmäßig `improved` (API: wenn `runtimeKind` fehlt). Die `**RI`-Korrektur des Compilers gilt für alle drei.

### Browser-Seite

[blitzc/js/blitzc.html](blitzc/js/blitzc.html) ist die gebündelte Einzeldatei und läuft von `file://`. [blitzc/js/index.html](blitzc/js/index.html) ist die Modulversion und braucht einen Webserver (zum Beispiel `npx serve js`). Das Bundle wird mit `python3 tools/bundle.py` neu gebaut. Bedienelemente:

- **Program with runtime**: tokenisiertes BASIC-7-PRG; darf leer bleiben, wenn die Liste darunter ein Programm enthält.
- **Program name**: Vorgabe `PROG`, aus dem Dateinamen gefüllt (Großbuchstaben, max. 14 Zeichen).
- **Programs without runtime**: „Add programs ...“ (mehrere Dateien), jeder Eintrag umbenennbar und entfernbar; sie laufen nur hinter dem Programm mit Runtime.
- **Keys as in reference file**: optionale originale `C/`-Datei, ergibt byte-identische Ausgabe; gilt für alle Programme.
- **RESUME and COLLISION with full syntax**: aus = originales Menü 1-3 (kein COLLISION, RESUME nur mit Zeilennummer, Compiler etwa 15 % schneller, Programm etwa 20 % kürzer); an = Menü 4-6 (2-Byte-Header pro Statement).
- **Shared variable table**: standardmäßig angehakt, nur bei zwei oder mehr Programmen aktiv; entspricht dem originalen Menüpunkt 4 (overlay): eine Variablentabelle, Dateien nach den Programmen benannt, Verkettung mit `LOAD "NAME",8`. Aus = jedes Programm einzeln als `C/NAME` + `Z/NAME`.
- **Runtime**: Improved (Vorgabe) / Fixed original / Original.
- **Fast math** (nur improved Runtime): automatisch (Vorgabe; wenn das Programm `*` `/` `^` SQR LOG EXP COS SIN TAN ATN benutzt) / an / aus.
- **Compile**: Download-Links `c-<name>.prg`, `z-<name>.prg` (Overlay: `<name>.prg`), plus `.d81` bei mehreren Programmen; Fortschrittszeilen PASS0/PASS1/PASS2 (PASS0 nur im Multi-Programm-/Overlay-Modus); ein Feld „Messages“ mit Fehlern und Zusammenfassung. Kompiliert in einem Web Worker.

### Kommandozeile

Node.js ist nötig (ES-Module, keine npm-Pakete, kein Installationsschritt; `node` ist eventuell nicht im PATH, zum Beispiel bei nvm). Aufruf aus `blitz128/blitzc`:

```sh
node js/cli.js <in.prg> <outdir> [options]
```

| Option | Argument | Vorgabe | Wirkung |
|---|---|---|---|
| `--no-runtime` | - | aus | `C/` ohne Runtime-Routinen (original: zwei Laufwerke, Punkt 5); lädt bei `$46B0`/`$6C41`, läuft hinter einer residenten Runtime. Im Multi-Modus nur für das erste Programm |
| `--full` | - | aus | RESUME und COLLISION mit voller Syntax (originales Menü 4-6) |
| `--overlay` | - | aus | mit `--plain`: alle Programme in einem Lauf wie originaler Menüpunkt 4: gemeinsame Variablentabelle, erstes Programm mit Runtime, Dateien `<name>.prg` (ohne `c-`-Präfix, keine Z/-Datei); Verkettung mit `LOAD "NAME",8`. Braucht mindestens 2 Programme |
| `--plain` | `a.prg,b.prg,...` | keine | weitere Programme, immer ohne Runtime kompiliert; `<in.prg>` darf dann `-` sein (kein Programm mit Runtime) |
| `--d81` | `file.d81` | keine | schreibt zusätzlich alle Ausgaben in ein 1581-Image; schaltet auch auf die Dateinamen des Multi-Modus um |
| `--runtime` | `original`\|`fixed`\|`improved` | `improved` | in das Programm kopierte Runtime (eine Auswahl pro Lauf) |
| `--fastmath` | `auto`\|`on`\|`off` | `auto` | nur improved Runtime: schnelle Multiplikation und SQR/LOG/EXP/SIN/COS/TAN/ATN; auto = wenn das Programm `*` `/` `^` SQR LOG EXP COS SIN TAN ATN benutzt (außerhalb von Strings, REM, DATA) |
| `--name` | `NAME` | `PROG` (einzeln); Dateistamm in Großbuchstaben (multi) | Programmname für das (erste) Programm |
| `--blitz` | `BLITZ!.128.prg` | eingebettetes Image | eigene Compiler-Datei verwenden |
| `--like` | `ref_c.prg` | zufällig | die 6 Keys und Padding-Bytes aus einer originalen `C/`-Datei übernehmen, für einen byte-identischen Nachbau |
| `--keys` | `k0,...,k5` (hex) | zufällig | die sechs Key-Bytes explizit (Warnung, wenn ein Key ein Nibble 0 hat); überschreibt `--like` |
| `--pad` | `b,...` (hex) | leer | Padding-Bytes (0-9) hinter dem Header, zusammen mit `--keys` benutzt |

Ausgabe: Der Einzelmodus schreibt `<outdir>/c.prg`, `z.prg`, `screen.txt` und gibt `errors: N  extensions: N  C/ ... B  Z/ ... B  runtime: ...` aus. Der Multi-Modus (`--plain` oder `--d81`) schreibt `<outdir>/c-<name>.prg` und `z-<name>.prg` (Kleinbuchstaben); der Overlay-Modus schreibt `<outdir>/<name>.prg`. Namen haben höchstens 14 Zeichen, Duplikate werden nummeriert (PROG, PROG2, ...). Das Ausgabeverzeichnis wird angelegt. Exitcode: 0 ok, 1 Compile-Fehler, 2 Aufruffehler.

Beispiele:

```sh
node js/cli.js prog.prg out/
node js/cli.js prog.prg out/ --runtime fixed
node js/cli.js prog.prg out/ --runtime improved --fastmath off
node js/cli.js prog.prg out/ --no-runtime --full
node js/cli.js prog.prg out/ --like ref/c.prg
node js/cli.js crawl.prg out/ --plain lib1.prg,lib2.prg --d81 out/all.d81
node js/cli.js a.prg out/ --plain b.prg,c.prg --overlay [--full] [--d81 out/all.d81]
```

### JavaScript-API

[blitzc/js/blitzc.js](blitzc/js/blitzc.js), ES-Modul. **Der API-Default für `runtimeKind` ist `'improved'`** (wie bei CLI und Seite); für die anderen Varianten `runtimeKind: 'original'` oder `'fixed'` explizit angeben.

- `compile(src, blitz|null, opts)` liefert `{c, z, errors, extensions, screen, messages, files, runtimeKind, fastMath}`. `blitz` null = eingebettete `BLITZ!.128`. Optionen: `name` (`'PROG'`), `runtime` (`true`; `false` = keine Runtime), `fullSyntax` (`false`), `keys` (6 Bytes), `pad`, `runtimeKind` (`'original'`\|`'fixed'`\|`'improved'`, Vorgabe `'original'`), `fastMath` (`'auto'` Vorgabe, `true`, `false`), `onEvent(ev)` (Events `start`, `pass`, `progress`, `message`), `maxSteps`. Wirft einen Fehler, wenn ein Programm mit der improved Runtime oberhalb von `$FC00` endet.
- `compileMany([{src,name,runtime}], blitz, opts, onEvent)` liefert ein Ergebnis pro Programm (`name, runtime, c, z, errors, extensions, error?`); zusätzliches Event `program`; ein fehlschlagendes Programm stoppt die anderen nicht. Erstes Programm mit Runtime, die anderen ohne, getrennte Variablentabellen.
- `compileOverlay([{src,name}], blitz, {fullSyntax, keys, pads, runtimeKind, fastMath}, onEvent)` liefert `[{name, runtime, c, z:null, errors, extensions, diskName}]`.
- `compileJob(job, post)` für Web Worker/Seite: job `{programs, blitz, like, fullSyntax, runtimeKind, fastMath, overlay}`; sendet Events, dann `{type:'done', ...}` oder `{type:'error', text}`.
- Helfer: `d81Of(results, diskName='BLITZC')`, `keysOf(c)`, `runtimeKindOf(c)`, `usesMath(prg)`, `validKey(k)`, `diskNames(names)`, `sourceLines(prg)`, `blitzImage(kind)`, `improvedRuntime(fastMath)`.

### Voraussetzungen, Tests und Neubau

- Benutzung: ein Browser (Online-Seite oder `js/blitzc.html` offline) oder Node.js. Getestet mit Node v26.13.1; eine Mindestversion ist nicht dokumentiert.
- Tests, aus `blitz128/blitzc`:

  ```sh
  node js/test.js
  ```

  Baut alle 57 Referenzen in `tests/expected` Byte für Byte nach (mit dem originalen Compiler in VICE erzeugt; das 2-Byte-FAST/SLOW-Delta wird auf die Referenzen angewendet), den Multi-Programm-Lauf, 9 Overlay-Ketten (`tests/overlay`), Prüfungen der improved und der fixed Runtime sowie die `**RI`-Prüfung. Letzter Lauf (2026-11-27): Exit 0, 70 „ok“-Zeilen, 0 FAIL. Dasselbe in headless Chrome ohne Node: `python3 tools/chrome-test.py`.
- Oracle (originaler Compiler in headless VICE): `oracle/compile.sh in.prg outdir`, `oracle/compare.sh x.prg ...`, `oracle/build-vice.sh`.
- Neubau-Kette: `tools/patch_blitz128.py` (erzeugt `fixed/blitz!.128.prg`), `tools/embed.py`, `tools/bc2js.py ../../fixed/blitz!.128.prg > ../js/compiler.gen.js`, `runtime2026/build.py` (braucht ca65/ld65 aus cc65), `tools/bundle.py`. `runtime2026/test/mathcheck.mjs` und `tools/fincheck.mjs` brauchen die C128-ROMs aus VICE; der Compiler selbst braucht kein ROM.
- Die perf-Skripte `perf/bench2.sh`, `perf/verify.sh`, `perf/verify_overlay.sh` brauchen VICE 3.10 `x128`.

## Technische Dokumentation und Reverse-Engineering-Ergebnisse (TL;DR)

- Der Compiler ist selbst ein Blitz-kompiliertes BASIC-Programm. Die Runtime ist ein Bytecode-Interpreter (`$1C01`-`$46AF`, etwa 11 KB); `C/` = Runtime + 41 gepatchte Key-Bytes + Header + XOR-Bytecode + Variablennamentabelle; zwei Runtime-Images (Image 1 bei `$1C01`, Image 2 bei `$4001` für Grafik). [analysis/BLITZ128_ANALYSE_de.md](analysis/BLITZ128_ANALYSE_de.md) ([English](analysis/BLITZ128_ANALYSE.md)).
- Keys: 6 zufällige Bytes pro Compile, als XOR-Kette in Header 2 versteckt; ein selbstentschlüsselnder Patcher in der Runtime schreibt sie beim Start an die 41 Stellen (Abschnitt 11 der Analyse).
- Rekonstruierter Compiler-Quelltext [blitzc/compiler_decomp.bas](blitzc/compiler_decomp.bas) (Dekompiler [bcdis.py](blitzc/tools/bcdis.py), [decomp.py](blitzc/tools/decomp.py)). Siehe [blitzc/README_de.md](blitzc/README_de.md) ([English](blitzc/README.md)).
- Neu assemblierbare, kommentierte Runtime-Quelltexte [analysis/runtime/runtime.s](analysis/runtime/runtime.s) (Image 1, baut byte-identisch nach) und [runtime2.s](analysis/runtime/runtime2.s) (Image 2); Übersicht in [analysis/runtime/README.md](analysis/runtime/README.md).
- Opcode-Map Statement zu Opcode: [analysis/runtime/ROSETTA.md](analysis/runtime/ROSETTA.md).
- Image 2: 404-Byte-Einschub mit Grafik-Front-Ends und der 10-Byte-Fehler: [analysis/runtime/IMAGE2.md](analysis/runtime/IMAGE2.md), [fixed/README.md](fixed/README.md).
- Overlay-/Chain-Modus: Menü 4 PASS0 gibt allen Modulen eine Variablentabelle; `LOAD "NAME",8` behält Variablen, `RUN` löscht sie; Merge-Regeln für Arrays, DEF FN, `**FI`: [analysis/runtime/OVERLAY.md](analysis/runtime/OVERLAY.md).
- Notizen zum Handbuch: Direktiven `**NG`/`**RI`/`**FI`/`**NE`, `::`-Erweiterungen (Opcode `$47`), Grenzen (255-Byte-Zeilen, 5000 Zeilen, 6000 Sprünge, 1000 Variablen, 255 Arrays, 200 `**FI`-Variablen): [analysis/runtime/MANUAL.md](analysis/runtime/MANUAL.md), Abschnitte 5.4, 14 und 15 der Analyse.
- Bekannt und nicht behoben: Programme ohne jede skalare Variable können keine Arrays benutzen (Fehler 18 BAD SUBSCRIPT; init überspringt CLR). Workaround: irgendeine skalare Variable deklarieren. Siehe „Side finding“ in [OVERLAY.md](analysis/runtime/OVERLAY.md) und Abschnitt 15 der Analyse.
- Wohin die Zeit der Runtime geht (bank-1 trampolines 20-31 % in Integer-Code; Float-Code 92 % im ROM, FMULT 43 %), Prototypen P1-P4, verworfene Ideen (FDIV, P4), MMU-Audit: [perf/RUNTIME_PERF_de.md](perf/RUNTIME_PERF_de.md) ([English](perf/RUNTIME_PERF.md)).
- Design der improved Runtime, Grenzen und Verifikation (fast math bit-identisch zum ROM: 1.000.000 Multiplikationen und je 100.000 pro Funktion, 0 Abweichungen): [runtime2026/README_de.md](runtime2026/README_de.md) ([English](runtime2026/README.md)).
- Das Parsen von Fließkomma-Konstanten ist bit-exakt portiert (500.000 Zufallszahlen, 0 Abweichungen, [tools/fincheck.mjs](blitzc/tools/fincheck.mjs)).
- Probe-Programme zur Reproduktion der VICE-Befunde: [analysis/runtime/probes/README.md](analysis/runtime/probes/README.md).

## Inhalt des Repositorys

| Pfad | Inhalt |
|---|---|
| [blitz!.128.prg](blitz!.128.prg) | die Compiler-Datei dieses Repos, V860929, 45 212 Bytes, gecrackte Kopie, unverändert |
| [blitz-128.d81](blitz-128.d81) | 1581-Diskette mit `blitz!.128` (byte-identisch zum .prg) und 25 gelöschten Einträgen (LIVE*-Quelltexte und C/ Z/ D/-Ausgaben), extrahiert in [analysis/d81/](analysis/d81/) |
| [fixed/](fixed/) | korrigierter Compiler [blitz!.128.prg](fixed/blitz!.128.prg) V261123 + README |
| [blitzc/](blitzc/) | JS-Compiler (`js/`), Werkzeuge, Oracle, Tests, rekonstruierter Compiler-Quelltext |
| [runtime2026/](runtime2026/) | Quelltexte der improved Runtime (`src/*.s`), `build.py`, Tests |
| [perf/](perf/) | Benchmarks ([bench/](perf/bench/)), Prototypen ([proto/](perf/proto/)), Mess-/Verifikationsskripte, RUNTIME_PERF.md |
| [analysis/](analysis/) | Analyse-Dokumente, Disassembly-Listings, [tools/](analysis/tools/), kommentierte Runtime, Probes, D81-Extrakte |
| [crawl/](crawl/) | CRAWL-Spiel als Testfall ([crawl.bas](crawl/crawl.bas)) und VICE-Compile-Läufe |
| [softrun.d64](softrun.d64) | aus dem ersten Commit (2023): `soft3`, `c/soft3`, `z/soft3`, `vdcbasic2.0ac6` |
| [modules128.d64](modules128.d64) | aus dem ersten Commit (2023): `loader`, `main`, `tenner`, `twentier`, `tentwen` |
| [../blitz64/modules64.d64](../blitz64/modules64.d64) | dieselbe Dateimenge für C64 |

## Herkunft und Lizenz

`BLITZ!.128` in diesem Repo ist eine gecrackte Kopie (Dongle-Abfrage deaktiviert, laut Angabe des Repository-Eigentümers). Es ist unbekannt, ob die ungecrackte Skyles-Distribution dieselbe Image-2-Verkürzung hat oder ob Crack oder Kopie sie eingeführt haben; „original“ bedeutet hier die unveränderte Datei dieses Repos. Das Repository steht unter der MIT-Lizenz, Copyright (c) 2023 The8BitTheory ([../LICENSE](../LICENSE)).
