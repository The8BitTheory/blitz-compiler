**English** · [Deutsch](README_de.md)

# Improved 2026 runtime

A faster runtime for programs compiled with the JavaScript compiler (`blitzc/js`). Choose it with `--runtime improved` (CLI), `runtimeKind: 'improved'` (API)
or "Improved 2026 runtime" on the browser page. The bytecode is unchanged; the compiler and the original runtime remain the reference
("Original runtime", V261123 = Skyles runtime + the 10-byte fix + the FAST/SLOW fix, see `fixed/README.md`).
Measurements, profiles and the evaluation behind it: `perf/RUNTIME_PERF.md`.

## What is faster
| Part | Technique | Source |
|---|---|---|
| Variable load/store (scalars and array elements) | runs in the top 1 KB of RAM that the MMU makes common to bank 0 and bank 1 (`$D506` = bottom + top 1 KB); one inline `STA $FF02 … STA $FF01` instead of three JSR/RTS trampoline calls | `src/var.s` |
| Array element addressing (`var_long_ref2`) | same, with inline bank-1 reads (generated from `runtime.s`) | `src/gen_arr.py` |
| NEXT with a floating-point loop variable | STEP 1: one bit added at the position of 1.0 in the mantissa; whole STEP −255..255: added at that position with at most one normalisation shift; exactly what ROM FADD computes for these operands, all other cases use the ROM; the loop variable is loaded/stored without the trampoline loop | `src/next.s` |
| **Fast math** (optional) | FMULT with quarter-square tables (2 KB, built at start behind the program), reproducing the ROM's shift-and-add result bit for bit including its quirks (zero bytes, `$03DF`); RAM copies of SQR, `^`, LOG, EXP, COS, SIN, TAN, ATN (+ POLY) whose internal multiplications use it | `src/math.s`, `src/gen_math.py` |

Results (cycles from start to END, `perf/bench2.sh`, VICE 3.10):

| Benchmark | Original | Improved | Improved + fast math (automatic) |
|---|---|---|---|
| `loop` (FOR, floats holding whole numbers) | 14.51 M | −17.6 % | −17.2 % |
| `fi` (same with `**FI`) | 8.05 M | −9.5 % | −8.7 % |
| `float` (SIN, SQR, `*`, `/`) | 29.42 M | −0.9 % | **−26.1 %** |
| `str` (string building) | 8.21 M | −12.0 % | −12.0 % |
| `arr` (array access) | 6.09 M | −20.0 % | −19.0 % |
| `sieve` (`FOR … STEP I`, `F%()`) | 14.54 M | −15.9 % | −15.5 % |

Fast math costs about 50,000 cycles at start (table build); programs that only use `*` in integer contexts are therefore not faster with it.
FDIV is not replaced: a bit-identical division faster than 1.5× is not possible (see `perf/RUNTIME_PERF.md`).

## Fast math selection
`--fastmath auto|on|off` (API `fastMath: 'auto'|true|false`, browser: "Fast math"). `auto` (default) switches it on when the program contains `*`, `/`, `^`,
SQR, LOG, EXP, COS, SIN, TAN or ATN outside strings, REM and DATA. All programs of one run (modules without runtime, overlay chains) get the same runtime.
At start the runtime builds the tables in bank-0 RAM behind the program; if they do not fit below `$8000` it uses the ROM routines.

## How it is built
The original runtime image stays in place byte for byte. The improvements are an **extension block** directly behind it
(image 1: `$46B0`, image 2: `$6C41`), reached through patched entry points:
* `init`: `jsr install_trampolines` → `jsr hook_init`. hook_init copies the real header into the first 18 bytes of the block,
  where the original runtime expects it (`$46B0`/`$6C41`, absolute in init, init_vars, data_ptr_init, the CLR stub and the encrypted key patcher).
  It copies the shared code to `$FC00`, makes the top 1 KB common, lowers the string top to `$FC00` and builds the fast-math tables.
* Variable entries: `jmp stub_<label>`. Each stub first selects MMU configuration A (FAST/SLOW and the VIC/SID statements leave CR=`$02`, where the KERNAL ROM covers `$FC00`).
* NEXT: the FADD call and the four `ld_var`/`st_var` calls. Fast math: the operator call in `float_arith_rom` and the function call in `rom_function`.
The compiler learns the size through `T1%`/`TE%` (`tools/bc2js.py` routes them to `rt.rtEnd1()`/`rt.rtLen2()`), writes image + block and puts header and bytecode behind it.

`python3 build.py` assembles everything with ca65/ld65 against the labels of `analysis/runtime/runtime.s` and `runtime2.s`, checks every patch site
against the expected bytes and writes `../blitzc/js/rt2026img.js` (variants plain and fastmath, both images). Then `python3 ../blitzc/tools/bundle.py`
rebuilds the browser page.

## Costs and limits
* Runtime +1.4 KB (plain) or +3.2 KB (fast math); plus 2 KB tables in RAM.
* The program must end below `$FC00` (the compiler refuses otherwise), and the string space in bank 1 is 768 bytes smaller (top `$FC00` instead of `$FF00`).
* MMU RCR = `$0C` while the program runs: machine code (SYS) that uses bank-1 RAM at `$FC00-$FEFF` or changes `$D506` itself does not work with it.
* All modules of an overlay chain must be compiled for the same runtime (the JS compiler does that for one run).

## Verification
* `test/mathcheck.mjs`: fast FMULT, SQR, LOG, EXP, COS, SIN, TAN, ATN, `^` against the BASIC ROM on a 6502 core with a C128 memory map
  (1,000,000 multiplications + 100,000 per function, including overflow/underflow and error cases): 0 differences (see `perf/RUNTIME_PERF.md`).
* `perf/verify.sh` (every test, probe and benchmark program, image 1 and image 2, in VICE: original vs improved, screen and end state),
  `perf/verify_overlay.sh` (overlay chains), `perf/test/nexttest*.bas` (NEXT edge cases), `node blitzc/js/test.js`.
