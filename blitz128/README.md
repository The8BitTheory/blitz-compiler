**English** · [Deutsch](README_de.md)

# Blitz! 128 compiler

Blitz! 128 (Skyles Electric Works, version string V860929, manual 1985 by Bob Skyles) compiles a tokenized BASIC 7 program into XOR-obfuscated bytecode plus a copied runtime (a bytecode interpreter). This directory holds the analysis of the compiler and runtime, fixes for the runtime, a faster runtime, and a JavaScript port of the compiler that runs in Node.js and in the browser.

**Online compiler:** <https://the8bittheory.github.io/blitz-compiler/> (everything runs locally in the browser; compiler build of 2026-11-24).

## Key points

- **Runtime bug fixes (two defects).** (1) Image 2 (the `$4001` runtime used for programs with graphics statements) is 10 bytes short in the `BLITZ!.128` of this repo: the compiler copies 11 328 bytes, the last 10 are RAM garbage, so CIRCLE/PAINT/BOX jump into uninitialised RAM and PI is garbage. (2) FAST/SLOW leave the MMU in configuration `$02`, so bytecode above `$8000` (programs with more than about 15 KB of bytecode) is read from ROM. Both are fixed in the `fixed` and `improved` runtimes; programs compiled earlier must be recompiled. Details: [fixed/README.md](fixed/README.md).
- **Compiler bug fix (one).** With `**RI n` in graphics programs, the original compiler pokes the value to the wrong address (end of its image-2 copy + 254 instead of image start + 254), so the runtime never restores the trampolines and input buffer after `::` extensions. The JavaScript compiler pokes the correct address; output differs from the original only in that byte and only when `**RI` is used. This applies to all three runtime choices. The original compiler on a C128 (and the `fixed/` build, which fixes only the runtime images) still has this bug.
- **Runtime performance.** The improved runtime executes the same bytecode and is faster (measured cycles start to END, VICE 3.10, `perf/bench2.sh`): -9.5 % to -20.0 % without fast math, float code only -0.9 %, and -26.1 % for float code with fast math. Costs: runtime +1.4 KB (plain) / +3.2 KB (fast math), 768 bytes less string space, program must end below `$FC00`. See [perf/RUNTIME_PERF.md](perf/RUNTIME_PERF.md) ([Deutsch](perf/RUNTIME_PERF_de.md)) and [runtime2026/README.md](runtime2026/README.md) ([Deutsch](runtime2026/README_de.md)).

| Benchmark | Original | Improved | Improved + fast math (auto) |
|---|---|---|---|
| loop | 14.51 M | -17.6 % | -17.2 % |
| fi (`**FI`) | 8.05 M | -9.5 % | -8.7 % |
| float (SIN, SQR, *, /) | 29.42 M | -0.9 % | -26.1 % |
| str | 8.21 M | -12.0 % | -12.0 % |
| arr | 6.09 M | -20.0 % | -19.0 % |
| sieve | 14.54 M | -15.9 % | -15.5 % |

## The JavaScript compiler (blitzc)

### What it is

A port of the Blitz! 128 compiler to JavaScript, in [blitzc/](blitzc/): [blitzc/js/blitzc.js](blitzc/js/blitzc.js) is an ES module without dependencies for Node.js and browsers; no emulator is needed. The compiler bytecode of the original is translated to JavaScript by [blitzc/tools/bc2js.py](blitzc/tools/bc2js.py). Output is byte-identical to the original compiler (given the same keys). Output files are `C/NAME` (program) and `Z/NAME` (address-to-line map). Further documentation: [blitzc/README.md](blitzc/README.md) ([Deutsch](blitzc/README_de.md)).

### Runtime variants

| Choice | CLI / API value | Content |
|---|---|---|
| Original runtime | `original` | Untouched Skyles V860929 runtime of 1986 with its defects (embedded untouched `BLITZ!.128`) |
| Fixed original runtime | `fixed` | V261123: original byte for byte plus the two runtime fixes; no speed-ups, same size and speed as original |
| Improved runtime | `improved` | V261123 fixes plus speed-ups, optionally fast math |

**Defaults differ:** CLI and page default to `improved`; the JavaScript API defaults to `original` when `runtimeKind` is omitted. The `**RI` compiler fix applies to all three.

### Browser page

[blitzc/js/blitzc.html](blitzc/js/blitzc.html) is the bundled single file and works from `file://`. [blitzc/js/index.html](blitzc/js/index.html) is the module version and needs a web server (for example `npx serve js`). Rebuild the bundle with `python3 tools/bundle.py`. Controls:

- **Program with runtime**: tokenized BASIC 7 PRG; may stay empty if the list below has a program.
- **Program name**: default `PROG`, filled from the file name (upper case, max 14 characters).
- **Programs without runtime**: "Add programs ..." (multiple files), each entry renamable and removable; they only run behind the program with runtime.
- **Keys as in reference file**: optional original `C/` file, gives byte-identical output; applies to all programs.
- **RESUME and COLLISION with full syntax**: off = original menu 1-3 (no COLLISION, RESUME only with line number, compiler about 15 % faster, program about 20 % shorter); on = menu 4-6 (2-byte header per statement).
- **Shared variable table**: checked by default, enabled only with two or more programs; corresponds to original menu item 4 (overlay): one variable table, files named like the programs, chain with `LOAD "NAME",8`. Off = each program separately as `C/NAME` + `Z/NAME`.
- **Runtime**: Improved (default) / Fixed original / Original.
- **Fast math** (improved runtime only): automatic (default; when the program uses `*` `/` `^` SQR LOG EXP COS SIN TAN ATN) / on / off.
- **Compile**: download links `c-<name>.prg`, `z-<name>.prg` (overlay: `<name>.prg`), plus `.d81` when several programs; progress rows PASS0/PASS1/PASS2 (PASS0 only in multi-program/overlay mode); a "Messages" box with errors and summary. Compiles in a Web Worker.

### Command line

Node.js is required (ES modules, no npm packages, no install step; `node` may not be on your PATH, for example with nvm). Run from `blitz128/blitzc`:

```sh
node js/cli.js <in.prg> <outdir> [options]
```

| Option | Argument | Default | Effect |
|---|---|---|---|
| `--no-runtime` | - | off | `C/` without runtime routines (original: two drives, item 5); loads at `$46B0`/`$6C41`, runs behind a resident runtime. In multi mode only for the first program |
| `--full` | - | off | RESUME and COLLISION with full syntax (original menu 4-6) |
| `--overlay` | - | off | with `--plain`: all programs in one run like original menu item 4: common variable table, first program with runtime, files `<name>.prg` (no `c-` prefix, no Z/ file); chain with `LOAD "NAME",8`. Needs at least 2 programs |
| `--plain` | `a.prg,b.prg,...` | none | further programs, always compiled without runtime; `<in.prg>` may then be `-` (no program with runtime) |
| `--d81` | `file.d81` | none | additionally write all outputs to a 1581 image; also switches to multi-mode file naming |
| `--runtime` | `original`\|`fixed`\|`improved` | `improved` | runtime copied into the program (one choice per run) |
| `--fastmath` | `auto`\|`on`\|`off` | `auto` | improved runtime only: fast multiplication and SQR/LOG/EXP/SIN/COS/TAN/ATN; auto = when the program uses `*` `/` `^` SQR LOG EXP COS SIN TAN ATN (outside strings, REM, DATA) |
| `--name` | `NAME` | `PROG` (single); upper-cased file stem (multi) | program name for the (first) program |
| `--blitz` | `BLITZ!.128.prg` | embedded image | use your own compiler file |
| `--like` | `ref_c.prg` | random | take the 6 keys and padding bytes from an original `C/` file for a byte-identical rebuild |
| `--keys` | `k0,...,k5` (hex) | random | the six key bytes explicitly (warning if a key has a zero nibble); overrides `--like` |
| `--pad` | `b,...` (hex) | empty | padding bytes (0-9) behind the header, used with `--keys` |

Output: single mode writes `<outdir>/c.prg`, `z.prg`, `screen.txt` and prints `errors: N  extensions: N  C/ ... B  Z/ ... B  runtime: ...`. Multi mode (`--plain` or `--d81`) writes `<outdir>/c-<name>.prg` and `z-<name>.prg` (lower case); overlay writes `<outdir>/<name>.prg`. Names are at most 14 characters, duplicates are numbered (PROG, PROG2, ...). The output directory is created. Exit code: 0 ok, 1 compile errors, 2 usage error.

Examples:

```sh
node js/cli.js prog.prg out/
node js/cli.js prog.prg out/ --runtime fixed
node js/cli.js prog.prg out/ --runtime improved --fastmath off
node js/cli.js prog.prg out/ --no-runtime --full
node js/cli.js prog.prg out/ --like ref/c.prg
node js/cli.js crawl.prg out/ --plain lib1.prg,lib2.prg --d81 out/all.d81
node js/cli.js a.prg out/ --plain b.prg,c.prg --overlay [--full] [--d81 out/all.d81]
```

### JavaScript API

[blitzc/js/blitzc.js](blitzc/js/blitzc.js), ES module. **API default `runtimeKind` is `'original'`** (CLI and page: `'improved'`); pass `runtimeKind` explicitly.

- `compile(src, blitz|null, opts)` returns `{c, z, errors, extensions, screen, messages, files, runtimeKind, fastMath}`. `blitz` null = embedded `BLITZ!.128`. Options: `name` (`'PROG'`), `runtime` (`true`; `false` = no runtime), `fullSyntax` (`false`), `keys` (6 bytes), `pad`, `runtimeKind` (`'original'`\|`'fixed'`\|`'improved'`, default `'original'`), `fastMath` (`'auto'` default, `true`, `false`), `onEvent(ev)` (events `start`, `pass`, `progress`, `message`), `maxSteps`. Throws if a program with the improved runtime ends above `$FC00`.
- `compileMany([{src,name,runtime}], blitz, opts, onEvent)` returns one result per program (`name, runtime, c, z, errors, extensions, error?`); extra event `program`; a failing program does not stop the others. First program with runtime, others without, separate variable tables.
- `compileOverlay([{src,name}], blitz, {fullSyntax, keys, pads, runtimeKind, fastMath}, onEvent)` returns `[{name, runtime, c, z:null, errors, extensions, diskName}]`.
- `compileJob(job, post)` for Web Worker/page: job `{programs, blitz, like, fullSyntax, runtimeKind, fastMath, overlay}`; posts events, then `{type:'done', ...}` or `{type:'error', text}`.
- Helpers: `d81Of(results, diskName='BLITZC')`, `keysOf(c)`, `runtimeKindOf(c)`, `usesMath(prg)`, `validKey(k)`, `diskNames(names)`, `sourceLines(prg)`, `blitzImage(kind)`, `improvedRuntime(fastMath)`.

### Requirements, tests and rebuilding

- Use: a browser (online page or `js/blitzc.html` offline) or Node.js. Tested with Node v26.13.1; no minimum version is documented.
- Tests, from `blitz128/blitzc`:

  ```sh
  node js/test.js
  ```

  Rebuilds all 57 references in `tests/expected` byte for byte (made with the original compiler in VICE; the 2-byte FAST/SLOW delta is applied to the references), the multi-program run, 9 overlay chains (`tests/overlay`), improved-runtime and fixed-runtime checks, and the `**RI` check. Last run (2026-11-27): exit 0, 70 "ok" lines, 0 FAIL. The same in headless Chrome without Node: `python3 tools/chrome-test.py`.
- Oracle (original compiler in headless VICE): `oracle/compile.sh in.prg outdir`, `oracle/compare.sh x.prg ...`, `oracle/build-vice.sh`.
- Rebuild chain: `tools/patch_blitz128.py` (makes `fixed/blitz!.128.prg`), `tools/embed.py`, `tools/bc2js.py ../../fixed/blitz!.128.prg > ../js/compiler.gen.js`, `runtime2026/build.py` (needs ca65/ld65 from cc65), `tools/bundle.py`. `runtime2026/test/mathcheck.mjs` and `tools/fincheck.mjs` need the C128 ROMs from VICE; the compiler itself needs no ROM.
- The perf scripts `perf/bench2.sh`, `perf/verify.sh`, `perf/verify_overlay.sh` need VICE 3.10 `x128`.

## Technical documentation and reverse-engineering findings (TL;DR)

- The compiler is itself a Blitz-compiled BASIC program. The runtime is a bytecode interpreter (`$1C01`-`$46AF`, about 11 KB); `C/` = runtime + 41 patched key bytes + header + XOR bytecode + variable name table; two runtime images (image 1 at `$1C01`, image 2 at `$4001` for graphics). [analysis/BLITZ128_ANALYSE.md](analysis/BLITZ128_ANALYSE.md) ([Deutsch](analysis/BLITZ128_ANALYSE_de.md)).
- Keys: 6 random bytes per compile, hidden as an XOR chain in header 2; a self-decrypting patcher in the runtime writes them into the 41 places at start (section 11 of the analysis).
- Recovered compiler source [blitzc/compiler_decomp.bas](blitzc/compiler_decomp.bas) (decompiler [bcdis.py](blitzc/tools/bcdis.py), [decomp.py](blitzc/tools/decomp.py)). See [blitzc/README.md](blitzc/README.md) ([Deutsch](blitzc/README_de.md)).
- Re-assemblable annotated runtime sources [analysis/runtime/runtime.s](analysis/runtime/runtime.s) (image 1, rebuilds byte-identical) and [runtime2.s](analysis/runtime/runtime2.s) (image 2); overview in [analysis/runtime/README.md](analysis/runtime/README.md).
- Opcode map statement to opcode: [analysis/runtime/ROSETTA.md](analysis/runtime/ROSETTA.md).
- Image 2: 404-byte insertion with graphics front ends and the 10-byte defect: [analysis/runtime/IMAGE2.md](analysis/runtime/IMAGE2.md), [fixed/README.md](fixed/README.md).
- Overlay/chain mode: menu 4 PASS0 gives all modules one variable table; `LOAD "NAME",8` keeps variables, `RUN` clears them; merge rules for arrays, DEF FN, `**FI`: [analysis/runtime/OVERLAY.md](analysis/runtime/OVERLAY.md).
- Manual notes: directives `**NG`/`**RI`/`**FI`/`**NE`, `::` extensions (opcode `$47`), limits (255-byte lines, 5000 lines, 6000 jumps, 1000 variables, 255 arrays, 200 `**FI` variables): [analysis/runtime/MANUAL.md](analysis/runtime/MANUAL.md), sections 5.4, 14 and 15 of the analysis.
- Known and not fixed: programs without any scalar variable cannot use arrays (error 18 BAD SUBSCRIPT; init skips CLR). Workaround: declare any scalar variable. See "Side finding" in [OVERLAY.md](analysis/runtime/OVERLAY.md) and section 15 of the analysis.
- Where runtime time goes (bank-1 trampolines 20-31 % in integer code; float code 92 % in ROM, FMULT 43 %), prototypes P1-P4, rejected ideas (FDIV, P4), MMU audit: [perf/RUNTIME_PERF.md](perf/RUNTIME_PERF.md) ([Deutsch](perf/RUNTIME_PERF_de.md)).
- Improved runtime design, limits and verification (fast math bit-identical to ROM: 1,000,000 multiplications and 100,000 per function, 0 differences): [runtime2026/README.md](runtime2026/README.md) ([Deutsch](runtime2026/README_de.md)).
- Floating-point constant parsing is ported bit-exact (500,000 random numbers, 0 differences, [tools/fincheck.mjs](blitzc/tools/fincheck.mjs)).
- Probe programs to reproduce VICE findings: [analysis/runtime/probes/README.md](analysis/runtime/probes/README.md).

## Repository contents

| Path | Content |
|---|---|
| [blitz!.128.prg](blitz!.128.prg) | the compiler file of this repo, V860929, 45 212 bytes, cracked copy, untouched |
| [blitz-128.d81](blitz-128.d81) | 1581 disk with `blitz!.128` (byte-identical to the .prg) and 25 deleted entries (LIVE* sources and C/ Z/ D/ outputs), extracted in [analysis/d81/](analysis/d81/) |
| [fixed/](fixed/) | fixed compiler [blitz!.128.prg](fixed/blitz!.128.prg) V261123 + README |
| [blitzc/](blitzc/) | JS compiler (`js/`), tools, oracle, tests, recovered compiler source |
| [runtime2026/](runtime2026/) | improved runtime sources (`src/*.s`), `build.py`, tests |
| [perf/](perf/) | benchmarks ([bench/](perf/bench/)), prototypes ([proto/](perf/proto/)), measurement/verification scripts, RUNTIME_PERF.md |
| [analysis/](analysis/) | analysis docs, disassembly listings, [tools/](analysis/tools/), annotated runtime, probes, D81 extracts |
| [crawl/](crawl/) | CRAWL game used as test case ([crawl.bas](crawl/crawl.bas)) and VICE compile runs |
| [softrun.d64](softrun.d64) | from the initial commit (2023): `soft3`, `c/soft3`, `z/soft3`, `vdcbasic2.0ac6` |
| [modules128.d64](modules128.d64) | from the initial commit (2023): `loader`, `main`, `tenner`, `twentier`, `tentwen` |
| [../blitz64/modules64.d64](../blitz64/modules64.d64) | same file set for C64 |

## Provenance and licence

`BLITZ!.128` in this repo is a cracked copy (dongle check disabled, as stated by the repository owner). It is unknown whether the uncracked Skyles distribution has the same image-2 truncation or whether the crack or copy introduced it; "original" here means the untouched file of this repo. The repository is under the MIT licence, Copyright (c) 2023 The8BitTheory ([../LICENSE](../LICENSE)).
