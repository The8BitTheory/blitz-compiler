[English](README.md) · **Deutsch**

# Improved 2026 Runtime

Eine schnellere Runtime für Programme, die der JavaScript-Compiler (`blitzc/js`) übersetzt. Auswahl mit `--runtime improved` (CLI), `runtimeKind: 'improved'` (API)
oder „Improved 2026 runtime“ auf der Browserseite. Der Bytecode bleibt unverändert. Compiler und Original-Runtime bleiben die Referenz
(„Original runtime“, V261123 = Skyles-Runtime + 10-Byte-Fix + FAST/SLOW-Fix, siehe `fixed/README.md`).
Messungen, Profile und die Bewertung dahinter: `perf/RUNTIME_PERF_de.md`.

## Was schneller ist
| Teil | Technik | Quelle |
|---|---|---|
| Variablen laden/speichern (Skalare und Array-Elemente) | läuft im obersten 1 KB RAM, das die MMU Bank 0 und Bank 1 gemeinsam macht (`$D506` = unteres + oberes 1 KB); ein einziges `STA $FF02 … STA $FF01` statt drei JSR/RTS-Trampolinaufrufen | `src/var.s` |
| Adressierung von Array-Elementen (`var_long_ref2`) | ebenso, mit direkten Lesezugriffen auf Bank 1 (aus `runtime.s` erzeugt) | `src/gen_arr.py` |
| NEXT mit Gleitkomma-Schleifenvariable | STEP 1: ein Bit an der Position von 1,0 in der Mantisse; ganzzahliger STEP −255..255: an dieser Position addiert, höchstens ein Normalisierungsshift; genau das Ergebnis der ROM-FADD für diese Operanden, alle anderen Fälle über das ROM; Schleifenvariable laden/speichern ohne Trampolinschleife | `src/next.s` |
| **Fast Math** (optional) | FMULT mit Viertelquadrat-Tabellen (2 KB, beim Start hinter dem Programm erzeugt), bildet das Ergebnis des ROM-Schiebe-Additions-Verfahrens bitgenau nach, samt seiner Eigenheiten (Nullbytes, `$03DF`); RAM-Kopien von SQR, `^`, LOG, EXP, COS, SIN, TAN, ATN (+ POLY), deren interne Multiplikationen sie nutzen | `src/math.s`, `src/gen_math.py` |

Ergebnisse (Takte vom Start bis END, `perf/bench2.sh`, VICE 3.10):

| Benchmark | Original | Improved | Improved + Fast Math (automatisch) |
|---|---|---|---|
| `loop` (FOR, Floats mit ganzzahligen Werten) | 14,51 M | −17,6 % | −17,2 % |
| `fi` (dasselbe mit `**FI`) | 8,05 M | −9,5 % | −8,7 % |
| `float` (SIN, SQR, `*`, `/`) | 29,42 M | −0,9 % | **−26,1 %** |
| `str` (Strings aufbauen) | 8,21 M | −12,0 % | −12,0 % |
| `arr` (Arrayzugriffe) | 6,09 M | −20,0 % | −19,0 % |
| `sieve` (`FOR … STEP I`, `F%()`) | 14,54 M | −15,9 % | −15,5 % |

Fast Math kostet beim Start etwa 50.000 Takte (Tabellenaufbau). Programme, die `*` nur in Integer-Rechnungen verwenden, werden damit also nicht schneller.
FDIV wird nicht ersetzt: Eine bitgleiche Division, die mehr als 1,5× schneller ist, geht nicht (siehe `perf/RUNTIME_PERF_de.md`).

## Auswahl von Fast Math
`--fastmath auto|on|off` (API `fastMath: 'auto'|true|false`, Browser: „Fast math“). `auto` (Standard) schaltet Fast Math ein, wenn das Programm `*`, `/`, `^`,
SQR, LOG, EXP, COS, SIN, TAN oder ATN außerhalb von Strings, REM und DATA enthält. Alle Programme eines Laufs (Module ohne Runtime, Overlay-Ketten) bekommen dieselbe Runtime.
Beim Start legt die Runtime die Tabellen im Bank‑0-RAM hinter dem Programm an. Passen sie nicht unterhalb von `$8000`, nimmt sie die ROM-Routinen.

## Aufbau
Das Original-Runtime-Image bleibt Byte für Byte an seinem Platz. Die Verbesserungen sind ein **Erweiterungsblock** direkt dahinter
(Image 1: `$46B0`, Image 2: `$6C41`), erreicht über gepatchte Einsprünge:
* `init`: `jsr install_trampolines` → `jsr hook_init`. hook_init kopiert den echten Header in die ersten 18 Byte des Blocks,
  wo ihn die Original-Runtime erwartet (`$46B0`/`$6C41`, absolut in init, init_vars, data_ptr_init, dem CLR-Stub und dem verschlüsselten Schlüssel-Patcher).
  Danach kopiert es den gemeinsamen Code nach `$FC00`, macht das oberste 1 KB gemeinsam, senkt die String-Obergrenze auf `$FC00` und baut die Fast-Math-Tabellen.
* Variablen-Einsprünge: `jmp stub_<label>`. Jeder Stub schaltet zuerst MMU-Konfiguration A ein (FAST/SLOW und die VIC/SID-Befehle lassen CR=`$02` stehen, dort überdeckt das KERNAL-ROM `$FC00`).
* NEXT: der FADD-Aufruf und die vier `ld_var`/`st_var`-Aufrufe. Fast Math: der Operator-Aufruf in `float_arith_rom` und der Funktionsaufruf in `rom_function`.
Der Compiler erfährt die Größe über `T1%`/`TE%` (`tools/bc2js.py` leitet sie an `rt.rtEnd1()`/`rt.rtLen2()`), schreibt Image + Block und legt Header und Bytecode dahinter.

`python3 build.py` assembliert alles mit ca65/ld65 gegen die Labels von `analysis/runtime/runtime.s` und `runtime2.s`, prüft jede Patchstelle
gegen die erwarteten Bytes und schreibt `../blitzc/js/rt2026img.js` (Varianten plain und fastmath, beide Images). Danach baut `python3 ../blitzc/tools/bundle.py`
die Browserseite neu.

## Kosten und Grenzen
* Runtime +1,4 KB (plain) bzw. +3,2 KB (Fast Math), dazu 2 KB Tabellen im RAM.
* Das Programm muss unter `$FC00` enden (sonst verweigert der Compiler), der String-Speicher in Bank 1 ist 768 Byte kleiner (Obergrenze `$FC00` statt `$FF00`).
* MMU-RCR = `$0C`, solange das Programm läuft: Maschinencode (SYS), der Bank‑1-RAM bei `$FC00–$FEFF` nutzt oder `$D506` selbst ändert, funktioniert damit nicht.
* Alle Module einer Overlay-Kette müssen für dieselbe Runtime übersetzt werden (der JS-Compiler macht das innerhalb eines Laufs).

## Prüfung
* `test/mathcheck.mjs`: schnelle FMULT, SQR, LOG, EXP, COS, SIN, TAN, ATN und `^` gegen das BASIC-ROM, auf einem 6502-Kern mit C128-Speicherbelegung
  (1.000.000 Multiplikationen + je 100.000 pro Funktion, inklusive Über-/Unterlauf und Fehlerfällen): 0 Abweichungen (siehe `perf/RUNTIME_PERF_de.md`).
* `perf/verify.sh` (alle Test-, Probe- und Benchmark-Programme, Image 1 und Image 2, in VICE: Original gegen Improved, Bildschirm und Endzustand),
  `perf/verify_overlay.sh` (Overlay-Ketten), `perf/test/nexttest*.bas` (Grenzfälle von NEXT), `node blitzc/js/test.js`.
