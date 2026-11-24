**English** · [Deutsch](RUNTIME_PERF_de.md)

# Blitz! 128 runtime – how much faster can it get?

As of: 23 Nov 2026 · Runtime image 1 (`$1C01`), compiler output of the JS port (byte-identical to the original), VICE 3.10 `x128`.
All numbers are CPU cycles from runtime start (`init`, `$2221`) to `END` (`$23A6`), measured with the VICE stopwatch.
The profiles come from the VICE monitor profiler (`prof`, per instruction).

## Result in short
* **Without changing the compiler or the bytecode, the three measured runtime changes P1–P3 save 11–19 % of the run time for integer loops, strings and arrays** (9.5 % with `**FI` variables, 1 % for floating-point code).
  They pass every image-1 program of the repository (screen and end state identical to the original runtime).
* The biggest cost is not the dispatcher but the **access to the variables in bank 1** through the trampolines at `$0202`
  (20–31 % of the time in integer code). Next come **NEXT with a floating-point loop variable** (ROM FADD) and the conversions between float and integer.
* **Floating-point code** spends 92 % of its time in the BASIC ROM (FMULT alone: 43 %, 2,515 cycles per call).
  Only an own multiplication helps there. Together with copies of SIN/SQR/EXP/LOG that use it, an estimated ≈30 %.
* Anything beyond that needs the compiler: typed opcodes (`**FI` already gives −45 % on the same loop) or native code.
* Side finding: **a bug in the original runtime**. `FAST`/`SLOW` leave the MMU in a ROM configuration, and bytecode at `$8000–$BFFF` that follows is then read from the BASIC ROM (see below).

## Implemented: Improved 2026 runtime (23 Nov 2026)
P1–P3 plus the estimated NEXT and fast-math items are now built as the **Improved 2026 runtime** of the JavaScript compiler
(`../runtime2026/`, `--runtime improved`), as an extension block behind the unchanged original image; the original runtime stays selectable.

| Benchmark | Original V261123 | Improved | Improved + fast math (auto) |
|---|---|---|---|
| `loop` | 14.51 M | −17.6 % | −17.2 % |
| `fi` | 8.05 M | −9.5 % | −8.7 % |
| `float` | 29.42 M | −0.9 % | **−26.1 %** |
| `str` | 8.21 M | −12.0 % | −12.0 % |
| `arr` | 6.09 M | −20.0 % | −19.0 % |
| `sieve` | 14.54 M | −15.9 % | −15.5 % |

* NEXT: STEP 1 keeps its own fast path (the general whole-number STEP path is slower for STEP 1); STEP −255..255 brought `sieve` from −13.0 % to −15.9 %.
* Fast math: FMULT is bit-identical to the ROM including its quirks (zero bytes in `$67`/`$66` go through the ROM shift routine `$8962`,
  which inserts `$03DF` and depends on the carry); `runtime2026/test/mathcheck.mjs` compares 1,000,000 multiplications and 100,000 calls per
  function (SQR LOG EXP COS SIN TAN ATN `^`) with the ROM on a 6502 core: 0 differences. FMULT ≈2× faster, the functions through their RAM copies.
  The large run found one bug that the short runs had missed: EXP of about −88.5 (result underflows to 0) crashed, because the EXP copy called
  MULDIV (`$8AEE`) through a thunk and MULDIV leaves with `PLA PLA` (return 0 from the caller), which removed the trampoline frame instead.
  MULDIV is now RAM code (`m_8AEE`/`m_8B09` in `math.s`); every other ROM routine called through a thunk was checked for unbalanced stack operations.
* **FDIV not replaced.** The ROM divides bit by bit (34 restoring steps, ≈2,350 cycles). A trial-subtraction loop is only ≈1.15× faster, a reciprocal
  with correction multiplication is slower than the ROM; the required ≥1.5× with bit-identical results is not reachable. FDIV is ≈5 % of `float`.
* Verified in VICE: every test/probe/benchmark program (51, image 1 and 2) with fast math auto, on and off, identical to the original runtime;
  the 9 overlay chains of `blitzc/tests/overlay` (with the same keys for both runs: a FN called after its module was overwritten reads key-dependent garbage).
* Lesson: the original runtime reads its header at fixed addresses ($46B0..$46C1, also in the encrypted key patcher whose bytes double as live code),
  so the header cannot move; the extension block starts with an 18-byte header shadow that hook_init fills.

### MMU audit (all 21 writes to `$FF00`)
Only `xop2a_FAST`/`xop29_SLOW` return to the main loop with CR≠A. All others restore configuration A before they continue: through
`io_status_check` (CHKIN, CHKOUT, CLOSE, OPEN), `op45_PRINT_end` (PRINT, SPC, CR, INPUT), `rom_call` (INPUT re-prompt, STR$ args), or an own
`sta $ff01` (INT, fac_to_int, STR$, GET, SPRCOLOR, SPRITE, JOY, RSPCOLOR, DMA). Fixed in both runtimes (V261123).

### Side finding (confirmed bug): `**RI` in graphics programs
For image 2 the compiler pokes the RI flag to `F+254` where F is the end of image 2 in its memory (`$CDA3` in the original), i.e. behind the
part it writes; for image 1 it pokes `$1CFF` correctly. The runtime reads the flag at offset `$FE` of its image (`$40FF` for image 2). So in
graphics programs (`$4001` runtime) `**RI` is ignored: `$40FF` is always 0, the trampolines ($0202 ff., in the BASIC input buffer) are never restored after a `::` command (EXTENSION), and the stray write
hits unused RAM (`$CDA3`) in the compiler's memory map. The JS compiler fixes this (hook in `blitzc/tools/bc2js.py`, poke to start+254; test in
`blitzc/js/test.js`); the original compiler still has the bug.

## Benchmarks (`bench/`)
| Program | Contents |
|---|---|
| `loop` | `FOR I=1 TO 3000` with `J=I AND 7 : K=K+J*2 : IF K>1000 …` (plain variables = floats holding whole numbers, the normal case) |
| `fi` | the same with `REM ** FI I,J,K` (fast integer) |
| `float` | `SIN`, `SQR`, `*`, `/` in a loop of 300 |
| `str` | string building with `+`, `CHR$`, `MID$`, `LEFT$` |
| `arr` | `DIM A(100),B%(100)`, element read and write |
| `sieve` | sieve of Eratosthenes up to 2000 with `F%()` and `FOR … STEP I` |

## Where the time goes (original runtime)
| | loop | fi | float | str | arr | sieve |
|---|---|---|---|---|---|---|
| cycles | 14.51 M | 8.05 M | 29.42 M | 8.21 M | 6.09 M | 14.54 M |
| bank-1 trampolines (`ld_var`, `st_var`, `rd_zp`, …) | 22 % | 20 % | 1 % | 31 % | 27 % | 25 % |
| dispatcher / operand push (incl. float→int narrowing) | 26 % | 32 % | 1 % | 12 % | 18 % | 18 % |
| variable addressing (`var_load`, arrays) | 14 % | 19 % | 1 % | 9 % | 23 % | 17 % |
| operators (int/float/string) | 16 % | 19 % | 1 % | 12 % | 12 % | 2 % |
| ROM (FADD in NEXT, FMULT, …) and IRQ | 13 % | 5 % | 95 % | 13 % | 12 % | 21 % |
| other handlers (NEXT, PRINT, …) | 8 % | 5 % | 1 % | 23 % | 8 % | 16 % |

Single facts from the profile:
* A variable read costs ≈170 cycles. `ld_var` alone averages 93 cycles per call. On top come one `rd_zp_set` and one `rd_zp` call (23 and 19 cycles plus JSR) only to read the type bits from bank 1.
* Every IRQ costs 966 cycles (≈5 % at 50 Hz). About half of it is the BASIC IRQ (`$4006`: sprite registers, SOUND/PLAY).
* NEXT with a float loop variable: `ld_var` + ROM FADD (≈360 cycles) + ROM rounding + `st_var`. In `sieve` this is ≈35 % of the run time.
* The XOR decryption of the bytecode (`EOR #imm`, 2 cycles per token) is ≈1 % and not worth touching.

## Measured prototypes (`proto/`)
The prototypes are ca65 sources. `mkimg.py` appends them to an already compiled `C/` file and patches JMPs into the runtime,
so neither the compiler nor the bytecode changes. Code that must see bank 1 runs in the top 1 KB of RAM, which is made
common to bank 0 and bank 1 (MMU `$D506` bit 3). There one inline `STA $FF02 … STA $FF01` replaces the JSR/RTS trampolines.

| | Change | loop | fi | float | str | arr | sieve |
|---|---|---|---|---|---|---|---|
| **P1** `fastvar.s` | variable load/store (scalars and array elements) inline in common RAM | −10.8 % | −9.5 % | −0.5 % | −5.3 % | −9.0 % | −5.9 % |
| **P1+P2** `fastarr.s` | + array addressing (`var_long_ref2`) with inline bank-1 reads | −10.8 % | – | – | – | −13.5 % | −9.3 % |
| **P1+P2+P3** `fastnext.s` | + NEXT with STEP 1: add one bit to the mantissa instead of ROM FADD | **−16.8 %** | **−9.5 %** | **−0.9 %** | **−11.0 %** | **−19.3 %** | **−12.6 %** |
| P4 `fastpush.s` | + float→int narrowing with mask test and unrolled shifts (relative to P1–P3) | −1.1 pts | 0 | | | +0.4 pts | −0.5 pts |

(–: P2 does not apply, the program has no arrays. P4 was measured on an earlier build without the entry stubs.)

* **P3 is exact.** For STEP 1 and a loop variable ≥ 1 whose integer part fits the 32-bit mantissa, adding 1.0 means adding a single bit at
  position `exp-$81`. No shift and no rounding happen, so the result is bit-identical to FADD. Every other case goes through the original ROM path.
  A first attempt via conversion to a 16-bit integer was *slower* than the ROM (bit-wise shifting: ≈460 instead of ≈380 cycles).
* **P4 is not worth it** (≈1 %): the shift loops cost less than they seemed to, and the fixed overhead per call eats most of the gain.
* **Entry stubs (lesson from the verification):** FAST/SLOW and the VIC/SID statements leave the MMU at CR=`$02`
  (KERNAL ROM over `$C000–$FFFF`). They rely on the next trampoline to restore configuration A. A direct jump to `$FC00` then lands in the ROM,
  so every redirected entry first goes through `STA $FF01` (costs ≈1 point; a real runtime would put that store at the entry itself).
* Size: P1+P2+P3 = 928 bytes (of them 615 bytes in the common page `$FC00–$FEFF`, of 768 available).
* **Check:** `verify.sh` compiles every program of `blitzc/tests/src`, `analysis/runtime/probes/src`, `test/` and `bench/`.
  It runs each image-1 program with the original runtime and with the prototype and compares how it ended (END bytes, error number, waiting for input) and the screen.
  **Result for P1+P2+P3: 39 of 39 identical** (11 programs are not image 1 and were skipped). Among them are the `::` extension probe, the array probes, six LIVE10 programs up to 37 KB and three LIVE6 programs.
  `test/nexttest.bas` covers the edge cases of P3: start 0 and 0.5, negative ranges, 65535/65536, 2^24, 2^31, STEP 2.5, an empty loop, a loop variable changed inside the loop.

## Estimated (not built)
| Idea | Gain | Cost / risk |
|---|---|---|
| **D** own FMULT (quarter-square tables, ≈600–700 instead of 2,515 cycles) | `*` alone: ≈4 % in `float`. With SIN/COS/SQR/EXP/LOG and the polynomial routine copied to RAM so that their internal multiplications use it as well: **≈30 % in floating-point code** | 2 KB tables + ≈0.8 KB code; FDIV analogous (another ≈5 %) |
| NEXT with any integer STEP, plus NEXT's `ld_var`/`st_var` inline | `sieve` ≈10–15 % more | the aligned step has to be cached in the FOR stack entry |
| Lean IRQ (skip the BASIC IRQ part) | ≈2.5 % everywhere | breaks MOVSPR/SOUND/PLAY/COLLISION, so only with a compiler flag or detection |
| **A** type table in bank 0 instead of P1 (no MMU change) | ≈6–7 % (only the two type reads per access disappear) | small; an alternative if the common top page is not acceptable |
| **E** keep integer scalars in bank 0 | after P1 only ≈3 % more (a fast int load is already ≈45 cycles) | sync with bank 1 at `::`, SYS, LOAD/overlay: not worth it |
| **F** typed / combined opcodes (compiler) | `**FI` already shows −45 % for integer loops; superinstructions (`I=I+1`, compare+jump) ≈20–30 % more; native code 3–10× | new bytecode format, new compiler |
| removing the XOR / another dispatch technique | ≈1 % / 0 | – |

## What P1–P3 would cost as a real runtime
* **Memory:** the string heap of bank 1 ends at `$FC00` instead of `$FF00` (−768 bytes). The program in bank 0 must end below `$FC00`, so the maximum program size shrinks by 768 bytes.
  The runtime grows by ≈0.9 KB, so header 1/2 move. The compiler has to write the runtime image and the header at the new address. In the JS port these are a few constants.
  The original compiler would need patching (it saves its own runtime from memory).
* **Compatibility:** MMU RCR = `$0C` (bottom and top 1 KB common) while the program runs. Machine-code routines (SYS) that use bank-1 RAM at `$FC00–$FEFF`
  or change RCR themselves would break. Tested: `::` extensions, arrays, strings, the LIVE programs (until their first key wait). Not tested yet: overlay chaining with a module compiled for the old runtime,
  sprite/sound statements in a long run.
* Image 2 (`$4001`, graphics) needs the same changes (shifted addresses, `runtime2.s`).
* The 41 key patch places and the encrypted patcher block `$23D0–$2437` stay untouched in the prototypes (all patch sites lie outside them).

## Side finding: FAST/SLOW break programs that run above `$8000` [confirmed, fixed in V261123]
`xop2a_FAST`/`xop29_SLOW` write `$02` to `$FF00` (I/O for `$D011`/`$D030`) and return with `jmp skip2` without selecting configuration A again.
In CR `$02`, `$8000–$BFFF` is BASIC ROM and `$C000–$FFFF` KERNAL ROM. The main loop reads the next tokens from there until a variable access passes a trampoline (`STA $FF01`).
Programs whose bytecode at that point lies above `$8000` (from ≈15 KB of bytecode on) then misbehave.
Test `test/gen_fast8000.py`: `X=1 : FAST : PRINT "A"; : SLOW : POKE 2000,7 : END` at `$887x` ends in error 27, at `$A49x` the POKE is missing.
The same line below `$8000`, and the variant without FAST, work. Fix: `sta $ff01` before `jmp skip2` in both handlers. Other handlers that write `MMU_CR` should be checked as well.

## Appendix: compiler in assembler?
45 KB `BLITZ!.128` = ≈20 KB compiler bytecode + ≈22 KB runtime images (needed as payload anyway; image 1 is also the compiler's own interpreter)
+ machine-code helpers. A hand-written assembler compiler would save at most the bytecode part. Storing image 2 as a delta to image 1
(404-byte insertion plus relocation) saves ≈10 KB regardless of the language. Whether native code speeds up a compile on real hardware depends on the share of disk I/O
(source read byte by byte, intermediate file `P/`). That should be measured first.

## Reproduce
```
bench2.sh <tag> [--fastmath on|off]  # benchmarks: JS compiler with original vs Improved 2026 runtime
verify.sh <tag> [--fastmath on|off]  # all programs, original vs improved, in VICE
verify_overlay.sh [--fastmath ...]   # overlay chains
../runtime2026/test/mathcheck.mjs N  # fast math against the ROM (6502 core)
```
Evaluation tools (prototypes appended to compiled files):
```
bench.sh <tag> [proto.s ...]     # all benchmarks: cycles + check of the result bytes (no proto = original runtime)
profile.py out/<b>/c.prg         # profile by routine and class (VICE 3.10 monitor profiler)
mkimg.py c.prg out.prg proto/fastvar.s proto/fastarr.s proto/fastnext.s
verify.sh p3 proto/fastvar.s proto/fastarr.s proto/fastnext.s
```
`run_bench.sh` is event-driven: breakpoints on init, END, the error handler and the first GETIN/CHRIN after init; timeout and cycle limit only guard against hangs.
Benchmarks are compiled with `blitzc/js/cli.js` (Node). `proto/fastarr.s` is generated from `analysis/runtime/runtime.s` by `proto/gen_fastarr.py`.
