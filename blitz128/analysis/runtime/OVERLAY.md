# Overlay / chain mode of Blitz!128 (compiler menu items 2-5, runtime side)

Found with the original compiler and the original runtime in VICE 3.10 (17.11.2026). The compile-side format was known before
(`blitzc/README.md`); this adds how the runtime behaves and what menu item 4 ("... WITH OVERLAY FEATURE") does.

## Compiler menu (target-disk menu, shown after the drive menu)
| item | meaning | set variables (compiler `decomp`) |
|---|---|---|
| 1 | single program, with runtime | `T%=1` |
| 2 | all programs of the source disk -> empty disk, each with runtime | `T%=2` |
| 3 | all programs -> empty disk, only the first module contains the runtime | `T%=3` |
| 4 | all programs -> empty disk, **with overlay feature** | `T%=4`, `T8%=1` (also runs the extra pass PASS0) |
| 5 | single program, without runtime | `T%=1`, `T9%=1` |

Output names in the multi-program modes are the plain program names (`ca`, `cb`), not `C/NAME`. (Item 4 compiled *every* program on the source
disk, so the compiler itself must not be on it; I swapped disks with the monitor `attach` command right after the compiler had started.)

## Chaining at run time
* `LOAD "next",8` inside a compiled program (op `$5D`) loads the next module and restarts the runtime (see the comment at `op5d_LOAD`);
  the new module goes through `init` -> `init_vars` in **check mode**: the old variables are kept if the new module's variable table fits
  (`vbase + size <= strend`) and every name equals the name stored in the same slot index; otherwise everything is cleared (`op15_CLR`).
* `RUN "next"` (`62 01 12`) always starts clean - it behaves like BASIC's RUN, variables are cleared.
* A module without runtime (menu 3/4/5) starts with its header at `$46B0` (load address `$46B0`, e.g. 36-38 bytes for a tiny program), directly
  behind the resident runtime.

## Experiments (A: `a=42:b$="hello":c=7`, POKE a; `load "cb",8`.  B: pokes `len(b$)`, `a`, `c` into $07D1-$07D3)
| compile mode | B's variable order | result at B's END (`$07D0..`) |
|---|---|---|
| 3 (runtime only in first) | same as A (`a,b$,c`) | `2A 2A 05` - A's values survive (B$ too) |
| 3 | different (`b$,a,c`) | `2A 00 00 00` - tables differ -> cleared |
| 4 (overlay) | different (`b$,a,c`) | `2A 2A 05 07` - survives |
| 2, 3, 4 with `run "cb"` instead of `load` | any | `2A 00 00` - cleared |

## What PASS0 / menu 4 does
Mode 4 adds a pass before PASS1/PASS2 that scans **all** programs of the disk and gives every module the **same variable-name table**
(union of all names, order of first appearance across the programs; here both modules got `a,b$,c` although B uses them in another order).
Header 1 of every module then carries the same variable count (`varsize = 7 * N`), so the check in `init_vars` always succeeds and variables
survive any `LOAD` between modules. In mode 3 each module gets its own table (B alone: `b$,a,c`) and chaining only works if the tables
happen to agree. The encryption keys are the same for all modules of one compile run.

## PASS0 merge rules for arrays, DEF FN and `**FI` (tested 17.11.2026)
Two-module programs, original (fixed) compiler, menu item 4, then run in VICE; the JS port reproduces every output byte for byte
(`blitzc/tests/overlay/ovl-*`, branch `overlay-mode`).

| what | rule observed | evidence |
|---|---|---|
| scalar variables | one table, order of first appearance over all programs in disk order, names unified (see above) | `ovl2`, `ovl3` |
| arrays | the array slots are numbered consistently in all modules (`a`:`07`, `b%`:`09`, `c$`:`0B` in both), also when module 2 uses them in another order; the arrays and their data **survive `LOAD`** | module 1 dims `a(5),b%(3),c$(2)` and fills them, module 2 (no DIM) reads `07 09 01` correctly, also in the order `c$,b%,a` (`ovl-arrays`) |
| array DIM in module 2 | a second `DIM` of an array that module 1 already dimensioned raises error 19 REDIM'D ARRAY | `ovl-redim`: error `$13` at `error_common` |
| DEF FN | FN names are part of the common table (`F X G` in both modules, FN slot operand = slot offset + 2 identical in both); each module may define its own FN | `ovl-fn`: `06 05 06` |
| FN defined in module 1, called in module 2 | the call refers to the same slot but the definition does **not** survive the `LOAD` (the body lives in module 1's bytecode, which module 2 overwrites): error 14 in module 2 | `ovl-fnx` |
| `**FI` | the "fast integer" flag is set on the name in the common table, for **all** modules: order is that of first appearance (the order inside the directive is irrelevant), a module without the directive sees the names as integers too, and a directive in module 2 changes module 1 (which is compiled afterwards, with the merged table): `i=1.5 : poke ..,i*10` gives 10, not 15 | `ovl-fi` (`01 02 03`), `ovl-fi2` (`01 02`), `ovl-fi3` (`0A 0A`) |

## Side finding: array element assignment with constant index and constant value (original runtime)
`dim a(5) : a(1)=7` raises **error 18 BAD SUBSCRIPT** when the program runs in VICE - no chaining involved, with the original and with the fixed
compiler, also for `a(0)=7`, `a(15)=7`, `a(16)=7`, `a%(1)=7`. These work: `a(i)=7` (variable index), `a(1)=i` (constant index, variable/float value), `a(i+1)=7`,
reading `a(1)`. The error comes from the integer-index path of `var_long_ref2` (`jmp err_bad_subscript`, `$2BB6`/`$2BF5`); the trigger seems to be that index
and value are both integer constants (`b1 b7 e4 07`). Cause not analysed, not tested on real hardware.

## Not done
* The merge rules were tested with two-module programs; larger sets, multi-dimensional arrays, `**NE/**NG/**RI/**SP` and mixed integer/float uses of one name were not.
* The JavaScript port implements menu item 4 (`compileOverlay`, branch `overlay-mode`); only compile output was compared with the original, the run-time behaviour above was checked with the original compiler's modules.
