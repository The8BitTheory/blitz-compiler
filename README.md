# blitzc – Nachbau des Blitz! 128 Compilers (Skyles, V860929)

Ziel: Der Compiler läuft ohne Emulator (Node und Browser). Eingabe ist ein getokentes BASIC-7-PRG, Ausgabe `C/`, `Z/` und `D/`, byte-identisch zum Original bei denselben sechs Zufallsschlüsseln.

## Stand
- `oracle/`: Original-Compiler headless in VICE 3.9 (Prüfstein)
  - `build-vice.sh` baut x128/c1541/petcat ohne root nach `~/vice`
  - `compile.sh in.prg outdir` erzeugt `c.prg z.prg [d.prg]`, `screen.txt`, `keys.txt`
- `tools/keys.py`: liest die 6 Schlüssel aus einer `C/`-Datei
- `tools/runimg.py`: Runtime-Abbild „wie ausgeführt“ (Patcher entschlüsselt und angewendet)
- `tests/src/*.bas|prg`, `tests/expected/<name>/`: Referenzausgaben des Originals

## Befunde (siehe ../analysis/BLITZ128_ANALYSE.md, Abschnitt 11)
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
