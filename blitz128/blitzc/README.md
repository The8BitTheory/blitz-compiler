**English** · [Deutsch](README_de.md)

# blitzc – a re-implementation of the Blitz! 128 compiler (Skyles, V860929)

> **Fixed build V261123.** The `BLITZ!.128` of this repository (V860929, a cracked copy) is 10 bytes short (whether the uncracked Skyles distribution is too is unknown); programs with graphics statements (the `$4001` runtime) then contain RAM garbage instead of the tail of the dispatch table (CIRCLE, PAINT, BOX, `$44`) and the constant PI. In addition, FAST/SLOW leave the MMU in a ROM configuration, so bytecode above `$8000` that follows is read from ROM. `tools/patch_blitz128.py` repairs both (`fixed/blitz!.128.prg`, version string V261123); this port embeds the fixed build for the Improved runtime and the untouched file for the "Original runtime" option; the page shows the compiler build date (2026-11-24). The test references were made with the original V860929 runtime: `js/test.js` and `tools/chrome-test.py` apply the known 2-byte FAST/SLOW delta before comparing. Details: `tools/patch_blitz128.py`, `../fixed/README.md`.

Goal: the compiler runs without an emulator (Node and browser). Input is a tokenized BASIC 7 PRG, output is `C/`, `Z/` and `D/`, byte-identical to the original for the same six random keys.

## Status
- `oracle/`: original compiler, headless in VICE 3.9 (the reference)
  - `build-vice.sh` builds x128/c1541/petcat without root into `~/vice`
  - `compile.sh in.prg outdir` produces `c.prg z.prg [d.prg]`, `screen.txt`, `keys.txt`
- `tools/keys.py`: reads the 6 keys from a `C/` file
- `tools/runimg.py`: runtime image "as executed" (patcher decrypted and applied)
- `tests/src/*.bas|prg`, `tests/expected/<name>/`: reference output of the original

## Findings (see ../analysis/BLITZ128_ANALYSE.md, section 11)
- The keys are chosen at random for every compile and depend on timing. In the emulator they are deterministic for identical key timing.
- First menu item `1` = single drive, "no COLLISION command". The compiler then asks for the program name and compiles right away.

## Decompiler (as of 15 Nov 2026)
- `tools/bcdis.py`: opcode table (lengths from `tools/oplen.py`, abstract interpretation of the runtime handlers). It splits every line of the corpus exactly (`tools/checklen.py`) and hits all 2,496 addresses of the compiler executed in the VICE trace.
- `tools/decomp.py c.prg`: bytecode becomes pseudo-BASIC (infix, variable names, jump labels `Lxxxx`, DATA table).
- `compiler_decomp.bas`: the recovered compiler. Code `$50F8–$9F72`, 121 variables, DATA table `$46CA` = 6502 machine-code routines (lines 63500 ff., loaded by POKE, entered via `SYS M%`/`SYS 5872`).

Format notes:
- DATA table: entries `len, text, line_lo, line_hi`, XOR key 5, end `$FF`.
- Jump targets: 2 bytes hi/lo, raw XOR keys 3/4. IF-skip `1F nn` is relative.
- `Z/` does not contain every line (lines with DO at the start of the program are missing), still to be clarified.
- Programs with graphics commands are produced as the `$4001` variant (header at `$6C41`).

## Runtime choice: original or Improved 2026 (as of 23 Nov 2026)
The runtime copied into the program with runtime can be the **original runtime** (untouched Skyles V860929 of 1986 with its defects, default) or the **Improved runtime** (V261123, includes the fixes)
(`../runtime2026/`: same bytecode, faster variable/array access and NEXT, optional fast math; about 10-26 % shorter run time, see `../runtime2026/README.md`).
```
node js/cli.js prog.prg out/ --runtime improved                  # fast math automatic (when the program uses * / ^ SQR LOG EXP COS SIN TAN ATN)
node js/cli.js prog.prg out/ --runtime improved --fastmath off   # or on
```
API: `compile(src, null, {runtimeKind: 'improved', fastMath: 'auto'|true|false})`, the same options for `compileMany`, `compileOverlay` and `compileJob`
(all programs of one run use the same runtime); `r.runtimeKind`, `r.fastMath`; `runtimeKindOf(c)` tells which runtime a C/ file carries, `keysOf()`
reads both kinds. The improved runtime needs `$FC00-$FEFF`: the compiler refuses programs that end above `$FC00`.
Browser page: fields "Runtime" and "Fast math". The runtime size reaches the translated compiler through `T1%`/`TE%` (`tools/bc2js.py` -> `rt.rtEnd1()`/`rt.rtLen2()`).

## JS port (as of 15 Nov 2026)

`js/` contains the compiler as a stand-alone program for Node and browser. **All 51 reference runs are byte-identical to the original (C/ and Z/)**, in all four variants (with/without runtime × restricted/full RESUME/COLLISION syntax), including CRAWL, all LIVE sources of the D81 (up to 56 KB source, 45 KB C/), error cases, directives, the `$4001` variant, and 80 floating-point constants.

```
node js/cli.js prog.prg out/                      # random keys like the original
node js/cli.js prog.prg out/ --no-runtime --full  # without runtime, full RESUME/COLLISION syntax
node js/cli.js prog.prg out/ --like ref/c.prg     # keys + filler bytes taken from an original C/ file
node js/test.js                                   # rebuild all tests/expected and compare
bash oracle/compare.sh x.prg ...                  # original (VICE) against port, same keys
MODE=65 bash oracle/compare.sh x.prg             # mode: 1, 4 (full syntax), 35 (no runtime), 65 (both)
```

Several programs (as of 17 Nov 2026): `--plain a.prg,b.prg` compiles further programs **without runtime** (they run behind the program with runtime, which comes first; `-` instead of `<in.prg>` = none), `--d81 out.d81` writes all `C/` and `Z/` files to a 1581 image. Output is then `c-<name>.prg`, `z-<name>.prg`. API: `compileMany([{src,name,runtime}], blitz, opts)`, `d81Of(results)` (`js/d81.js`). `D/` and `P/` are intermediate files that the compiler deletes itself at the end; they are not part of the output.
```
node js/cli.js crawl.prg out/ --plain lib1.prg,lib2.prg --d81 out/all.d81
```
Browser: open `js/blitzc.html` directly (a single file, built with `tools/bundle.py`; `js/index.html` is the module version for a web server). API: `compile(srcPrg, blitzPrg|null, {name, runtime, fullSyntax, keys, pad})` (null = embedded BLITZ!.128 from `js/blitzimg.js`, produced with `tools/embed.py`) from `js/blitzc.js` → `{c, z, errors, screen}`.

Structure:
- `tools/bc2js.py` translates the **bytecode of the compiler** (not the pseudo-BASIC) to `js/compiler.gen.js`: one `case` per jump target, label = original address. This removes the display errors of `compiler_decomp.bas` (`?`, `ARRn(a,b,…)`): all arrays are one-dimensional, FOR/GET/READ/INPUT take the most recently loaded variable as reference, `X58` = `IF x THEN RETURN`, POKE/OPEN have reversed argument order.
- `js/rt.js`: BASIC primitives, 1581 simulation (channels, command channel, scratch, status), keyboard (menu `1`, program name), DATA table, native versions of the machine-code helpers: `SYS 288/291` tokenizer, `SYS 5872` read line, `SYS 5960/5985` read/write byte (key at `$1769`), `SYS 6012` search in integer array, `SYS 5816` write memory block.
- The runtime in C/ comes from BLITZ!.128 itself; the file is embedded as Base64 (`js/blitzimg.js`), the CLI accepts your own with `--blitz` (the browser page always uses the embedded one) (image 1 with the compiler keys patched at run time, image 2 from `$A065` plus 10 bytes of RAM pattern `00 00 00 FF FF FF FF 00 00 00`).

Findings from the port:
- Randomness: RND(0) is drawn only for the 6 keys (order W1,W3,W4,W5,W6,W2), for J% (0–9 filler bytes behind the header) and the filler bytes themselves. `keysOf()` reads everything back from a C/ file.
- `$1D00` in C/ is the buffer used by VAL (string copy without end null, max. 160 bytes) and INPUT# (with end null). It holds the last status line `00, OK,00,00` and possibly remains of a long constant.
- Floating-point constants: VAL is a Blitz-specific routine (`$4314`) that collects the digits in 16 bits and then calls arithmetic routines in the C128 BASIC ROM (×10, ÷10, addition, rounding). `js/cbmfloat.js` ports this code, including the ROM routines, instruction by instruction with the carry flag to JS; **no ROM needed**. Checked with `node tools/fincheck.mjs 500000`: 500,000 random numbers against the original code on the 6502 core (`js/cpu6502.js`, which needs the BASIC ROM hi 318019-04 from VICE for this), 0 differences.
- Oracle: large sources need more frames, e.g. `FRAMES=40000 TMO=580 CYCLES=9000000000`.
- Deliberate deviation from the original: `**RI n` in graphics programs (runtime image 2, `$4001`). The original compiler pokes the value to the end of its copy of the image (start+TE%+254) instead of start+254, so `$40FF` stays 0 and the runtime never restores the trampolines. The JS port pokes to the correct address (hook in `tools/bc2js.py`); output differs from the original compiler only in that byte (and only if `**RI` is used).
- `Z/` is a BASIC program (load address `$0401`): per line `04 08`, address as line number, text `= nnn `.
- Variants: full RESUME/COLLISION syntax = menu 4–6 (`TA%=2`), without runtime = second menu item 5 (`T9%=1`), which appears only with dual drive or two drives. The port internally drives menu 1/4 and 3/6 with devices 8→9; the drive setup has no other influence. C/ without runtime starts directly with the header (load address `$46B0` or `$6C41`). Test names: `<name>.m4`, `.m35`, `.m65`.

### Text output in the browser (as of 16 Nov 2026)
`js/blitzc.html` no longer shows the raw C128 screen text but three progress rows (PASS0/PASS1/PASS2: bar, percentage, last line number) and a scrollable, read-only textarea for all other messages (`?extensions in N`, errors, summary). Menu and title text are gone.
- `rt.js` translates the cursor output of the compiler (HOME/DOWN + number = current line, `PASSn`, message lines) into events; `compile(..., {onEvent})` adds position and total number of source lines (`sourceLines()`), `r.messages` returns the messages, `r.screen` is unchanged.
- Events: `start`, `pass`, `progress {pass,line,index,total}`, `message {text}`. PASS0 only runs in multi-program mode (T8); the port only serves single programs.
- The page compiles in a Web Worker (`js/worker.js`; in `blitzc.html` via Blob URL, also works from `file://`) so that progress appears live; without a worker the same code runs in the page.

### Several programs in the browser (as of 17 Nov 2026)
The field "Program with runtime" stays; below it is the list "Programs without runtime" (several files can be added at once, the name of each entry can be changed, entries can be removed). If the list has an element, the runtime field may stay empty. Order: the program with runtime comes first. Options (full syntax, reference file) apply to all programs. Output: `c-…` and `z-…` per program as separate downloads, and for several programs additionally a `.d81` with `C/NAME` and `Z/NAME`. Names: at most 14 characters, duplicates are numbered. A failing program does not stop the others. `node js/test.js` additionally checks that multi-program runs equal the single runs.

## Overlay mode ("Shared variable table", original menu item 4)
All programs are compiled in **one run** like menu item 4 of the original ("all programs ... with overlay feature"): the compiler first runs
PASS0 over all of them and gives every module the **same variable-name table** (union, order of first appearance across the programs). Chained with
`LOAD "NAME",8` (not `RUN`, which always clears the variables) the variables then survive from module to module. The first module contains the runtime,
the others start behind it. Output files carry the plain program names (no `C/` prefix, no `Z/` file), exactly as the original writes them.
```
node js/cli.js a.prg out/ --plain b.prg,c.prg --overlay [--full] [--d81 out/all.d81]    # out/a.prg, b.prg, c.prg
```
API: `compileOverlay([{src, name}, ...], blitz|null, {fullSyntax, keys, pads}, onEvent)` -> `[{name, runtime, c, errors, extensions, diskName}]`.
Browser page: checkbox **Shared variable table** (on by default, enabled only when at least two programs are selected; off = every program on its own
with `C/NAME` and `Z/NAME` as before). How it works and the experiments behind it: `analysis/BLITZ128_ANALYSE.md`, section 13 and `analysis/runtime/OVERLAY.md`.
The port drives the translated original compiler through its menu (source disk = device 8 with all programs, empty target disk = device 9), so PASS0 and
the table merge are the original's own code. `tests/overlay/` holds references made with the original compiler in VICE; `node js/test.js` and `tools/chrome-test.py` rebuild them byte for byte.
