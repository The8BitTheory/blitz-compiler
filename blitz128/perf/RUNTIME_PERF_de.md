[English](RUNTIME_PERF.md) · **Deutsch**

# Blitz!-128-Runtime – wie viel schneller geht es?

Stand: 23.11.2026 · Runtime-Image 1 (`$1C01`), Compiler-Ausgabe des JS-Ports (byte-identisch zum Original), VICE 3.10 `x128`.
Alle Zahlen sind CPU-Takte vom Start der Runtime (`init`, `$2221`) bis `END` (`$23A6`), gemessen mit der Stoppuhr von VICE.
Die Profile stammen aus dem Profiler des VICE-Monitors (`prof`, pro Instruktion).

## Ergebnis in Kürze
* **Ohne Änderung an Compiler oder Bytecode sparen die drei gemessenen Runtime-Änderungen P1–P3 11–19 % Laufzeit bei Integer-Schleifen, Strings und Arrays** (9,5 % mit `**FI`-Variablen, 1 % bei Gleitkomma).
  Alle Image‑1-Programme des Repos laufen damit identisch (Bildschirm und Endzustand wie mit der Original-Runtime).
* Die größten Kosten verursacht nicht der Dispatcher, sondern der **Zugriff auf die Variablen in Bank 1** über die Trampoline bei `$0202`
  (20–31 % der Zeit in Integer-Code). Danach folgen **NEXT mit Gleitkomma-Schleifenvariable** (ROM-FADD) und die Umwandlungen zwischen Float und Integer.
* **Gleitkomma-Code** verbringt 92 % seiner Zeit im BASIC-ROM, allein FMULT macht 43 % aus (2515 Takte pro Aufruf).
  Dagegen hilft nur eine eigene Multiplikation, zusammen mit Kopien von SIN/SQR/EXP/LOG, die sie benutzen, geschätzt ≈30 %.
* Darüber hinaus braucht es den Compiler: typisierte Opcodes (`**FI` bringt in derselben Schleife schon −45 %) oder nativen Code.
* Nebenbefund: **ein Fehler in der Original-Runtime**. `FAST`/`SLOW` lassen die MMU in einer ROM-Konfiguration stehen, danach wird Bytecode bei `$8000–$BFFF` aus dem BASIC-ROM gelesen (siehe unten).

## Umgesetzt: Improved 2026 Runtime (23.11.2026)
P1–P3 sowie die geschätzten Punkte zu NEXT und Fast Math sind jetzt als **Improved 2026 Runtime** des JavaScript-Compilers gebaut
(`../runtime2026/`, `--runtime improved`): als Erweiterungsblock hinter dem unveränderten Original-Image; die Original-Runtime bleibt wählbar.

| Benchmark | Original V261123 | Improved | Improved + Fast Math (auto) |
|---|---|---|---|
| `loop` | 14,51 M | −17,6 % | −17,2 % |
| `fi` | 8,05 M | −9,5 % | −8,7 % |
| `float` | 29,42 M | −0,9 % | **−26,1 %** |
| `str` | 8,21 M | −12,0 % | −12,0 % |
| `arr` | 6,09 M | −20,0 % | −19,0 % |
| `sieve` | 14,54 M | −15,9 % | −15,5 % |

* NEXT: STEP 1 behält einen eigenen schnellen Pfad (der allgemeine Pfad für ganzzahlige STEPs ist bei STEP 1 langsamer); STEP −255..255 hat `sieve` von −13,0 % auf −15,9 % gebracht.
* Fast Math: FMULT ist bitgleich zum ROM samt seiner Eigenheiten (Nullbytes in `$67`/`$66` laufen über die ROM-Shiftroutine `$8962`,
  die `$03DF` einschiebt und vom Carry abhängt). `runtime2026/test/mathcheck.mjs` vergleicht 1.000.000 Multiplikationen und je 100.000 Aufrufe
  pro Funktion (SQR LOG EXP COS SIN TAN ATN `^`) auf einem 6502-Kern mit dem ROM: 0 Abweichungen. FMULT ist ≈2× schneller, die Funktionen profitieren über ihre RAM-Kopien.
  Erst der große Lauf fand einen Fehler, den die kurzen Läufe nicht getroffen hatten: EXP von etwa −88,5 (das Ergebnis unterläuft zu 0) stürzte ab. Die EXP-Kopie rief
  MULDIV (`$8AEE`) über einen Thunk auf, und MULDIV endet in diesem Fall mit `PLA PLA` (gibt 0 an den Aufrufer zurück). Damit entfernte es den Rahmen des Trampolins statt den des Aufrufers.
  MULDIV ist jetzt RAM-Code (`m_8AEE`/`m_8B09` in `math.s`). Alle anderen über Thunks aufgerufenen ROM-Routinen wurden auf unausgeglichene Stackoperationen geprüft.
* **FDIV wird nicht ersetzt.** Das ROM dividiert bitweise (34 Schritte mit Rückstellung, ≈2.350 Takte). Eine Probesubtraktions-Schleife ist nur ≈1,15× schneller,
  ein Kehrwert mit Korrekturmultiplikation ist langsamer als das ROM; die geforderten ≥1,5× bei bitgleichem Ergebnis sind nicht erreichbar. FDIV macht ≈5 % von `float` aus.
* Geprüft in VICE: alle Test-, Probe- und Benchmark-Programme (51, Image 1 und 2) mit Fast Math auto, on und off, identisch zur Original-Runtime;
  die 9 Overlay-Ketten aus `blitzc/tests/overlay` (mit denselben Schlüsseln für beide Läufe: eine FN, die nach dem Überschreiben ihres Moduls aufgerufen wird, liest schlüsselabhängigen Müll).
* Lehre: Die Original-Runtime liest ihren Header an festen Adressen ($46B0..$46C1, auch im verschlüsselten Schlüssel-Patcher, dessen Bytes zugleich lebender Code sind),
  der Header kann also nicht wandern; der Erweiterungsblock beginnt deshalb mit einer 18-Byte-Schattenkopie des Headers, die hook_init füllt.

### MMU-Audit (alle 21 Schreibzugriffe auf `$FF00`)
Nur `xop2a_FAST`/`xop29_SLOW` kehren mit CR≠A in die Hauptschleife zurück. Alle anderen stellen Konfiguration A vorher wieder her: über
`io_status_check` (CHKIN, CHKOUT, CLOSE, OPEN), `op45_PRINT_end` (PRINT, SPC, CR, INPUT), `rom_call` (INPUT-Wiederholung, STR$-Argumente) oder ein eigenes
`sta $ff01` (INT, fac_to_int, STR$, GET, SPRCOLOR, SPRITE, JOY, RSPCOLOR, DMA). In beiden Runtimes behoben (V261123).

### Nebenbefund (wahrscheinlich, nicht getestet): `**RI` in Grafikprogrammen
Für Image 2 pokt der Compiler das RI-Flag nach `F+254`, wobei F das Ende von Image 2 in seinem Speicher ist (`$CDA3` im Original), also hinter den Teil,
den er schreibt; für Image 1 pokt er korrekt nach `$1CFF`. `REM **RI` wirkt also vermutlich nicht in Programmen, die mit der `$4001`-Runtime übersetzt werden.

## Benchmarks (`bench/`)
| Programm | Inhalt |
|---|---|
| `loop` | `FOR I=1 TO 3000` mit `J=I AND 7 : K=K+J*2 : IF K>1000 …` (normale Variablen = Floats mit ganzzahligen Werten, der Normalfall) |
| `fi` | dasselbe mit `REM ** FI I,J,K` (fast integer) |
| `float` | `SIN`, `SQR`, `*`, `/` in einer Schleife über 300 |
| `str` | Strings aufbauen mit `+`, `CHR$`, `MID$`, `LEFT$` |
| `arr` | `DIM A(100),B%(100)`, Elemente lesen und schreiben |
| `sieve` | Sieb des Eratosthenes bis 2000 mit `F%()` und `FOR … STEP I` |

## Wohin die Zeit geht (Original-Runtime)
| | loop | fi | float | str | arr | sieve |
|---|---|---|---|---|---|---|
| Takte | 14,51 M | 8,05 M | 29,42 M | 8,21 M | 6,09 M | 14,54 M |
| Bank‑1-Trampoline (`ld_var`, `st_var`, `rd_zp`, …) | 22 % | 20 % | 1 % | 31 % | 27 % | 25 % |
| Dispatcher / Operand-Push (inkl. Float→Int-Verengung) | 26 % | 32 % | 1 % | 12 % | 18 % | 18 % |
| Variablenadressierung (`var_load`, Arrays) | 14 % | 19 % | 1 % | 9 % | 23 % | 17 % |
| Operatoren (Int/Float/String) | 16 % | 19 % | 1 % | 12 % | 12 % | 2 % |
| ROM (FADD in NEXT, FMULT, …) und IRQ | 13 % | 5 % | 95 % | 13 % | 12 % | 21 % |
| übrige Handler (NEXT, PRINT, …) | 8 % | 5 % | 1 % | 23 % | 8 % | 16 % |

Einzelbefunde aus dem Profil:
* Ein Variablen-Lesezugriff kostet ≈170 Takte. `ld_var` allein braucht im Schnitt 93 Takte pro Aufruf. Dazu kommen je ein Aufruf von `rd_zp_set` und `rd_zp` (23 bzw. 19 Takte plus JSR), nur um die Typbits aus Bank 1 zu lesen.
* Jeder IRQ kostet 966 Takte (≈5 % bei 50 Hz), etwa die Hälfte davon ist der BASIC-IRQ (`$4006`: Sprite-Register, SOUND/PLAY).
* NEXT mit Float-Schleifenvariable: `ld_var` + ROM-FADD (≈360 Takte) + ROM-Rundung + `st_var`. In `sieve` sind das ≈35 % der Laufzeit.
* Die XOR-Entschlüsselung des Bytecodes (`EOR #imm`, 2 Takte pro Token) macht ≈1 % aus, das Anfassen lohnt nicht.

## Gemessene Prototypen (`proto/`)
Die Prototypen sind ca65-Quellen. `mkimg.py` hängt sie an eine bereits kompilierte `C/`-Datei an und patcht JMPs in die Runtime.
Compiler und Bytecode bleiben also unverändert. Code, der Bank 1 sehen muss, läuft im obersten 1 KB RAM, das Bank 0 und Bank 1
gemeinsam ist (MMU `$D506` Bit 3). Dort ersetzt ein einziges `STA $FF02 … STA $FF01` im Code die JSR/RTS-Trampoline.

| | Änderung | loop | fi | float | str | arr | sieve |
|---|---|---|---|---|---|---|---|
| **P1** `fastvar.s` | Variable laden/speichern (Skalare und Array-Elemente) direkt im gemeinsamen RAM | −10,8 % | −9,5 % | −0,5 % | −5,3 % | −9,0 % | −5,9 % |
| **P1+P2** `fastarr.s` | + Array-Adressierung (`var_long_ref2`) mit direkten Bank‑1-Lesezugriffen | −10,8 % | – | – | – | −13,5 % | −9,3 % |
| **P1+P2+P3** `fastnext.s` | + NEXT mit STEP 1: ein Bit zur Mantisse addieren statt ROM-FADD | **−16,8 %** | **−9,5 %** | **−0,9 %** | **−11,0 %** | **−19,3 %** | **−12,6 %** |
| P4 `fastpush.s` | + Float→Int-Verengung mit Maskentest und ungerollten Schiebebefehlen (relativ zu P1–P3) | −1,1 Pkt | 0 | | | +0,4 Pkt | −0,5 Pkt |

(–: P2 greift nicht, das Programm hat keine Arrays. P4 wurde mit einem früheren Stand ohne Einsprung-Stubs gemessen.)

* **P3 ist exakt.** Bei STEP 1 und einer Schleifenvariablen ≥ 1, deren ganzzahliger Teil in die 32‑Bit-Mantisse passt, heißt „+1,0“: ein einzelnes Bit an
  Position `exp-$81` addieren. Es wird weder geschoben noch gerundet, das Ergebnis ist also bitgleich zu FADD. Alle anderen Fälle laufen über den Original-ROM-Pfad.
  Ein erster Versuch über die Umwandlung in einen 16‑Bit-Integer war *langsamer* als das ROM (bitweises Schieben: ≈460 statt ≈380 Takte).
* **P4 lohnt sich nicht** (≈1 %): Die Schiebeschleifen kosten weniger als gedacht, der feste Mehraufwand pro Aufruf frisst den Gewinn größtenteils auf.
* **Einsprung-Stubs (Lehre aus der Verifikation):** FAST/SLOW und die VIC/SID-Befehle lassen die MMU auf CR=`$02` stehen
  (KERNAL-ROM über `$C000–$FFFF`). Sie verlassen sich darauf, dass das nächste Trampolin Konfiguration A wiederherstellt. Ein direkter Sprung nach `$FC00` landet dann im ROM.
  Deshalb führt jeder umgeleitete Einsprung erst über `STA $FF01` (kostet ≈1 Punkt; in einer echten Runtime stünde dieser Befehl direkt am Einsprung).
* Größe: P1+P2+P3 = 928 Byte (davon 615 Byte in der gemeinsamen Seite `$FC00–$FEFF`, 768 verfügbar).
* **Prüfung:** `verify.sh` kompiliert alle Programme aus `blitzc/tests/src`, `analysis/runtime/probes/src`, `test/` und `bench/`.
  Jedes Image‑1-Programm läuft einmal mit Original-Runtime und einmal mit Prototyp. Verglichen werden das Ende (END-Bytes, Fehlernummer, Warten auf Eingabe) und der Bildschirm.
  **Ergebnis für P1+P2+P3: 39 von 39 identisch** (11 Programme sind kein Image 1 und wurden übersprungen). Darunter sind die `::`-Extension-Probe, die Array-Probes, sechs LIVE10-Programme bis 37 KB und drei LIVE6-Programme.
  `test/nexttest.bas` deckt die Grenzfälle von P3 ab: Start bei 0 und 0,5, negative Bereiche, 65535/65536, 2^24, 2^31, STEP 2,5, eine leere Schleife, eine im Rumpf veränderte Schleifenvariable.

## Geschätzt (nicht gebaut)
| Idee | Gewinn | Kosten / Risiko |
|---|---|---|
| **D** eigene FMULT (Viertelquadrat-Tabellen, ≈600–700 statt 2515 Takte) | nur `*`: ≈4 % in `float`. Mit SIN/COS/SQR/EXP/LOG und der Polynom-Routine als RAM-Kopie, damit auch deren interne Multiplikationen sie nutzen: **≈30 % in Gleitkomma-Code** | 2 KB Tabellen + ≈0,8 KB Code; FDIV analog (weitere ≈5 %) |
| NEXT mit beliebigem ganzzahligem STEP, dazu `ld_var`/`st_var` von NEXT direkt im gemeinsamen RAM | `sieve` ≈10–15 % mehr | ausgerichteten STEP im Eintrag des FOR-Stapels zwischenspeichern |
| Schlanker IRQ (BASIC-Anteil überspringen) | ≈2,5 % überall | bricht MOVSPR/SOUND/PLAY/COLLISION, also nur mit Compiler-Schalter oder Erkennung |
| **A** Typtabelle in Bank 0 statt P1 (ohne MMU-Änderung) | ≈6–7 % (nur die zwei Typ-Lesezugriffe pro Zugriff entfallen) | gering; eine Alternative, falls die gemeinsame Seite oben nicht akzeptabel ist |
| **E** Integer-Skalare in Bank 0 halten | nach P1 nur noch ≈3 % mehr (ein schneller Int-Ladevorgang kostet schon nur ≈45 Takte) | Abgleich mit Bank 1 bei `::`, SYS, LOAD/Overlay: lohnt nicht |
| **F** typisierte / zusammengefasste Opcodes (Compiler) | `**FI` zeigt schon −45 % bei Integer-Schleifen; Superinstruktionen (`I=I+1`, Vergleich+Sprung) ≈20–30 % mehr; nativer Code 3–10× | neues Bytecode-Format, neuer Compiler |
| XOR entfernen / andere Dispatch-Technik | ≈1 % / 0 | – |

## Was P1–P3 als echte Runtime kosten würden
* **Speicher:** Der String-Heap in Bank 1 endet bei `$FC00` statt `$FF00` (−768 Byte). Das Programm in Bank 0 muss unter `$FC00` enden, die maximale Programmgröße sinkt also um 768 Byte.
  Die Runtime wird ≈0,9 KB größer, Header 1/2 rutschen nach hinten. Der Compiler muss Runtime-Image und Header an der neuen Adresse schreiben, im JS-Port sind das wenige Konstanten.
  Der Original-Compiler müsste gepatcht werden (er speichert seine eigene Runtime aus dem Speicher).
* **Kompatibilität:** MMU-RCR = `$0C` (unteres und oberes 1 KB gemeinsam), solange das Programm läuft. Maschinenroutinen (SYS), die Bank‑1-RAM bei `$FC00–$FEFF` benutzen
  oder RCR selbst ändern, würden nicht mehr funktionieren. Getestet: `::`-Extensions, Arrays, Strings, die LIVE-Programme (bis zum ersten Tastendruck). Noch nicht getestet: Overlay-Verkettung mit einem Modul,
  das für die alte Runtime kompiliert wurde, sowie Sprite-/Sound-Befehle im Dauerlauf.
* Image 2 (`$4001`, Grafik) braucht dieselben Änderungen (verschobene Adressen, `runtime2.s`).
* Die 41 Schlüssel-Patchstellen und der verschlüsselte Patcher-Block `$23D0–$2437` bleiben in den Prototypen unberührt (alle Patchstellen liegen außerhalb).

## Nebenbefund: FAST/SLOW bringen Programme oberhalb von `$8000` durcheinander [bestätigt, behoben in V261123]
`xop2a_FAST`/`xop29_SLOW` schreiben `$02` nach `$FF00` (I/O für `$D011`/`$D030`) und kehren mit `jmp skip2` zurück, ohne Konfiguration A wieder einzuschalten.
In CR `$02` liegt bei `$8000–$BFFF` BASIC-ROM und bei `$C000–$FFFF` KERNAL-ROM. Die Hauptschleife liest die folgenden Tokens von dort, bis ein Variablenzugriff über ein Trampolin (`STA $FF01`) führt.
Programme, deren Bytecode an dieser Stelle oberhalb von `$8000` liegt (ab ≈15 KB Bytecode), laufen dann falsch.
Test `test/gen_fast8000.py`: `X=1 : FAST : PRINT "A"; : SLOW : POKE 2000,7 : END` endet bei `$887x` mit Fehler 27, bei `$A49x` fehlt das POKE.
Dieselbe Zeile unterhalb von `$8000` und die Variante ohne FAST funktionieren. Korrektur: `sta $ff01` vor `jmp skip2` in beiden Handlern. Andere Handler, die `MMU_CR` beschreiben, sollten ebenfalls geprüft werden.

## Anhang: Compiler in Assembler?
45 KB `BLITZ!.128` = ≈20 KB Compiler-Bytecode + ≈22 KB Runtime-Images (ohnehin als Nutzlast nötig; Image 1 ist zugleich der Interpreter des Compilers)
+ Maschinencode-Helfer. Ein handgeschriebener Assembler-Compiler spart höchstens den Bytecode-Anteil. Image 2 als Delta zu Image 1 abzulegen
(404-Byte-Einschub plus Relokation) spart ≈10 KB, unabhängig von der Sprache. Ob nativer Code das Kompilieren auf echter Hardware beschleunigt, hängt vom Anteil der Disk-I/O ab
(Quelle wird byteweise gelesen, Zwischendatei `P/`). Das sollte man zuerst messen.

## Nachvollziehen
```
bench2.sh <tag> [--fastmath on|off]  # Benchmarks: JS-Compiler mit Original- gegen Improved-2026-Runtime
verify.sh <tag> [--fastmath on|off]  # alle Programme, Original gegen Improved, in VICE
verify_overlay.sh [--fastmath ...]   # Overlay-Ketten
../runtime2026/test/mathcheck.mjs N  # Fast Math gegen das ROM (6502-Kern)
```
Werkzeuge der Evaluierung (Prototypen, an kompilierte Dateien angehängt):
```
bench.sh <tag> [proto.s ...]     # alle Benchmarks: Takte + Prüfung der Ergebnisbytes (ohne proto = Original-Runtime)
profile.py out/<b>/c.prg         # Profil nach Routine und Klasse (Profiler des VICE-3.10-Monitors)
mkimg.py c.prg out.prg proto/fastvar.s proto/fastarr.s proto/fastnext.s
verify.sh p3 proto/fastvar.s proto/fastarr.s proto/fastnext.s
```
`run_bench.sh` arbeitet ereignisgesteuert: Haltepunkte auf init, END, den Fehlerhandler und das erste GETIN/CHRIN nach init; Timeout und Zyklenlimit dienen nur als Schutz gegen Hänger.
Die Benchmarks werden mit `blitzc/js/cli.js` (Node) kompiliert. `proto/fastarr.s` erzeugt `proto/gen_fastarr.py` aus `analysis/runtime/runtime.s`.
