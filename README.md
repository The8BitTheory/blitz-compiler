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
