# Probe programs and scripts (runtime behaviour, checked with the real compiler in headless VICE)

Small BASIC programs that were used to find and demonstrate behaviour of the runtime, plus the scripts that compile and run them with the real
`BLITZ!.128` in VICE. All results in `../*.md` that say "VICE" can be reproduced with these.

## Needs
`x128` and `c1541` from VICE (3.9/3.10, on `PATH` or `X128=`/`C1541=`), `python3`, the C128 ROMs of VICE. The compiler file is `blitz128/blitz!.128.prg`
(override with `BLITZ=...`; the fixed build is `blitz128/fixed/blitz!.128.prg`).

## Scripts
| script | what it does |
|---|---|
| `compile.sh in.prg outdir [blitz]` | compiles ONE program (menu 1) -> `outdir/c.prg`, `z.prg`, `screen.txt` |
| `run.sh c.prg` | runs a compiled program and prints how it ended: `END` + the bytes `$07D0..$07D7`, `ERROR n` or `NO END ...`; `END_ADDR`/`ERR_ADDR` select the handler addresses (`23a6`/`24c0` for image 1, `4937`/`4a51` for the `$4001` image of graphics programs) |
| `check.sh [probe ...]` | compile + run every probe in `expected.txt` and compare (about 30 s per probe) |
| `compile-overlay.sh outdir a.prg b.prg ...` | menu item 4 (overlay) for several programs, plain module names in `outdir/`, disk image `outdir/o.d81` (`FULL=1` = full syntax) |

The programs end with `END`; the probes report their result by `POKE`s into `$07D0...` (read back by `run.sh`).

## Probes (`src/NAME.bas` source, `src/NAME.prg` tokenized with `petcat -w70`)
| probe | source | result with `check.sh` | what it shows |
|---|---|---|---|
| `c1` | `dim a(5):a(1)=7:poke 2000,a(1)` | `ERROR 18` | array use in a program **without any scalar variable** fails: `init` skips CLR |
| `c2` | three arrays, constants | `ERROR 18` | same |
| `c3`, `c6`, `c7` | `a(0)=7`, `a(15)=7`, `a(16)=7` | `ERROR 18` | same (not a matter of the constant) |
| `c4` | `dim a%(5):a%(1)=7` | `ERROR 18` | same, integer array |
| `c13` | two arrays | `ERROR 18` | same |
| `c5` | `i=1:a(i)=7` | `END 07 ...` | a scalar variable exists -> works |
| `c8` | `i=2:a(i+1)=7` | `END 07 ...` | works |
| `c9`, `c10` | constant index, variable value / variable store + constant read | `END 07 ...` | work (one scalar variable) |
| `c11`, `c12` | `x=0` before / `x=1` after the array use | `END 07 ...` | the scalar variable may stand anywhere in the program (the table is built at compile time) |
| `e1` | `poke 2000,1:::poke 2001,5:poke 2002,3` | `END 01 05 03 ...` | the `::` extension is executed by the BASIC interpreter (opcode `$47`, see `../names.py`) |

Explanation of the array rows: `../OVERLAY.md` (side finding), `../../BLITZ128_ANALYSE.md` section 15.

### Graphics probes (need the fixed compiler for the `$4001` runtime; not part of `check.sh`)
| probe | source | with `fixed/blitz!.128.prg` | with the untouched `blitz!.128.prg` |
|---|---|---|---|
| `g` | `graphic 1,1 : circle ... : box ... : paint ... : graphic 0 : end` | reaches `END` | `NO END` (CIRCLE/PAINT/BOX jump into uninitialised RAM, see `../IMAGE2.md`) |
| `pi` | `graphic 0 : a=pi*1000 : poke 2000,lo : poke 2001,hi` | `END 45 0c ...` (3141) | `ERROR 15` (OVERFLOW: the PI constant is RAM garbage) |

    ./compile.sh src/g.prg /tmp/g ../../../fixed/blitz\!.128.prg
    END_ADDR=4937 ERR_ADDR=4a51 ./run.sh /tmp/g/c.prg
(`src/pi.bas` shows `z` where the PI token `$FF` stands: the `.prg` has the byte patched in, `petcat` cannot write it.)

## Overlay chain test (menu item 4)
    ./compile-overlay.sh /tmp/ov ../../../blitzc/tests/overlay/ovl2/src/ca.prg ../../../blitzc/tests/overlay/ovl2/src/cb.prg
    x128 -8 /tmp/ov/o.d81 ...      # load "ca",8 and RUN; module CB reads the variables of CA ($07D0..$07D3)
The compiled references of these cases are in `blitzc/tests/overlay/`; the port rebuilds them byte for byte. (In VICE the compiler's random keys are deterministic for the same key timing, so `/tmp/ov/ca.prg` equals `tests/overlay/ovl2/expected/ca.prg`.)

Verified on 17.11.2026: `check.sh` reports `ok` for all 14 probes; the graphics rows and the overlay example were run once by hand with the commands above.
