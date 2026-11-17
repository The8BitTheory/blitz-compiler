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

## Not done
* The JavaScript port (`blitzc/js`) implements menu items 1, 3-like (`--plain`) and 5, not item 4 / PASS0 (union table). The union rule above
  (first appearance over all programs, in disk order) is what a port would have to reproduce - not verified beyond the two-program example.
* Other details of PASS0 (how arrays, DEF FN, `**FI` variable lists are merged) are untested.
