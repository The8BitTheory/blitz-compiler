# Notes on the instruction manual (Skyles Electric Works, 1985, "BLITZ! 128 - A BASIC Compiler for Commodore 128", Bob Skyles)

The scanned PDF (40 pages, 1-bit images, no text layer) was read page by page on 17.11.2026 (rendered through Chrome). Numbers and names were read from the images
and may contain reading errors. Page numbers are the printed ones. Where the manual and the experiments in this repository differ, both are stated.

## Overview
| p. | topic |
|---|---|
| 1-3 | introduction: P-code, ~65 % of the source size, ~11 KB of run-time routines, extensions, overlay, dongle |
| 4 | restrictions: TRAP, RESUME, COLLISION (restricted syntax in menu 1-3), GRAPHIC CLR, CONT, STOP key |
| 5-6 | the special instructions `REM ** NG / RI / FI / NE` and `::` |
| 7-15 | operation: language question (`e`/`d`), main menu 1-6, compile sub-options 1-5 |
| 17-24 | details: pass 1 / pass 2, files `c/ z/ p/ d/`, sub-options, limits |
| 25-26 | error correction with the cross-reference file `z/NAME` |
| 27-29 | differences to BASIC: capacity, STOP, CONT, integer arithmetic, rounding, arrays, FOR-NEXT, overhead |
| 31 | machine language |

## What the manual settles
* **Directives** (p. 5-6, 27, 29): `NG` = no graphic array (do not reserve the 9 KB hi-res area; the program is otherwise relocated to `$4000` as soon as a GRAPHIC command is found; only needed for extremely long programs > 220 blocks and for GRAPHIC 5; in multi-program mode needed once, in the first program);
  `RI` = restore the input buffer (`$0200-$0240`; BLITZ has its own buffer, switch back after EXTENSION or SYS routines); `FI a,b,c` = floating point variables become integer variables (max. 200, useful for FOR-NEXT, the changed variables are not passed to EXTENSION commands);
  `NE` = no EXTENSION listing in pass 1; `::` = EXTENSION - the command up to the next `:` is skipped by the compiler and handed to the BASIC interpreter at run time (a BASIC command treated as extension needs all its partners as extensions: FOR-NEXT, OPEN-PRINT-INPUT-CLOSE).
  `SP` is **not documented** (four directives begin with `REM **`: NG, RI, FI, NE).
* **Menu** (p. 7, 12): language `e`/`d`; 1-3 = restricted syntax (no COLLISION, RESUME with line number only; compiles 15 % faster, P-code 20 % shorter), 4-6 = full syntax; single drive / dual drive / 2 single drives;
  sub-options 1 single program with runtime, 2 all programs each with runtime, 3 all programs only the first with runtime, 4 all programs with OVERLAY, 5 single program without runtime.
  In the two-drive case the compiler asks for the device numbers (`device no. source program ?8`, `object program :9`).
* **Overlay** (p. 3, 10-11, 14, 22-23): option 3 "variables will not be passed between the programs"; option 4 "variables will be passed ... BLITZ! 128 will make an extra pass to read the variables"; run-time routines only in the first module;
  "the starting program, if shorter than the others, is lengthened to the size of the longest program"; "all arrays should be declared (DIM) at least in the program that references them first, otherwise BAD SUBSCRIPT ERROR";
  "no reloading of the starting program is possible or all variables will be lost" (save it twice under different names: `start`, `start2`); option 5 "allows corrections to a program within a set previously compiled with option 3".
* **Files** (p. 19-21): `c/NAME` (compiled), `z/NAME` (cross reference), `p/NAME` (pure P-code) and `d/NAME` (DATA) during the compile, the last two are scratched before the end of pass 2; the multi-program options 2-4 create no cross-reference files.
* **Passes** (p. 17-18): pass 1 translates, checks SYNTAX / TYPE MISMATCH / (BAD SUBSCRIPT, OVERFLOW warnings), stores line numbers and variable/array names; pass 2 replaces references by exact locations (UNDEFINED STATEMENT);
  the result = run-time routines, DATA statements, P-code, table of variables.
* **Error correction** (p. 25-26): the run-time error shows the program counter in place of the line number; `LOAD "z/test",8` and `LIST -9912` shows the last cross-reference line `9909=520`.
* **Arrays** (p. 28): one-dimensional arrays default to 11 elements, multi-dimensional ones must be DIMed; "BLITZ! 128 builds a special array with the normally illegal name `z*%`: a 5 byte header and a series of 2 byte pointers to each array found in the original program" (compare the array offsets `07 09 0B` in `OVERLAY.md`).
* **Rounding** (p. 28): BLITZ uses the same rounding everywhere (`PEEK(145/3*3)` = location 145).
* **Machine language** (p. 31): compiled programs cannot have ML appended; use BLOAD/BOOT; after a SYS BLITZ takes over the a, x, y, s registers; the ML routine should restore the BASIC text pointer at `$3D/$3E` (61/62) - this is what `jump_3d3e` / `user_return` in `runtime.s` do.
* **Capacity** (p. 23, 27): source line 255 bytes, 5000 lines, 6000 jumps (GOTO, GOSUB, NEXT), 1000 variables, 255 arrays, 200 `**FI` variables.
* **Restrictions** (p. 4): TRAP only alone or with a line number, RESUME with line number only, COLLISION with line number only (menu 1-3); all TRAPs and COLLISIONs are cancelled by END/STOP and after LOAD/DLOAD; GRAPHIC CLR clears the 9 KB screen (except GRAPHIC 0); CONT is not usable; the STOP key is always disabled (RESET is the only way to stop).

## Cross-checks against our findings
| manual | experiment / code | result |
|---|---|---|
| option 4 passes variables via an extra pass | PASS0, `OVERLAY.md` | agrees |
| option 3 passes no variables | mode 3 keeps them when the tables happen to be identical | an implementation detail, not a feature |
| starting program lengthened to the longest | modules of one run share `vbase`; the compiler does it itself (the port reproduces outputs byte for byte) | consistent, not examined separately |
| `z*%` array with 5-byte header + 2-byte pointers | array operands `07/09/0B` | consistent |
| array not DIMed = BAD SUBSCRIPT warning | arrays survive LOAD, a second DIM raises error 19 | consistent (the manual does not mention error 19) |
| `**FI` list, max 200 | the flag sits on the name in the common table for all modules | the manual does not say it applies to all modules |
| ML restores `$3D/$3E` | `jump_3d3e` | agrees |
| `::` passes a command to the BASIC interpreter | `?extensions in N` messages, probably opcode `$47` / `tr_call_user` | agrees, opcode link not verified |
| dongle in the user port | compiler and compiled programs run in VICE without any dongle | not explained: the check is absent in this version or not emulated |
| (nothing) | `dim a(5) : a(1)=7` -> error 18 (constant index and value) | not mentioned in the manual |
