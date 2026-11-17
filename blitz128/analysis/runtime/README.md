# Annotated Blitz!128 runtime

`runtime.s` is a **re-assemblable ca65 source** of the Blitz!128 runtime (image 1, `$1C01-$46AF`, as executed:
patcher block decrypted, see `../BLITZ128_ANALYSE.md` section 11). `make` regenerates it and proves that it
assembles back to exactly the bytes of `../run_1c01.bin`:

    make            # mkasm.py -> runtime.s, ca65 + ld65, byte-for-byte comparison
    ...  rebuilt 10927 bytes (expected 10927): IDENTICAL

* `mkasm.py`  – disassembler/generator (recursive descent from the opcode tables and known entries)
* `names.py`  – **all human knowledge lives here**: symbol names, comments, opcode names. Edit this, not `runtime.s`.
* `rt.cfg`, `Makefile` – build and check.

## What is annotated so far
| Area | State |
|---|---|
| Loader, init, header parsing, variable slots | named and commented [sure] |
| Trampolines at `$0202` (MMU bank switching, bank-1 access, ROM calls) | fully decoded, named, documented [sure] |
| Dispatcher / token classes / operand classes | documented [sure] |
| Shared helpers (get_byte, get_word, pop_value, int<->fac, rom_call, GC, VAL, ...) | named, tagged [sure]/[likely] |
| ~90 opcode handlers | named from the compiler's own output, see `ROSETTA.md` (statement/function -> opcode map, verified against the original compiler's tests) |
| Ext. opcodes (`$00 xx`) | labelled `xopXX`; fully named except `1F-21`, `25`, `2C`, `3C`, `44` |
| Operator handlers `$01-$0D` (int/float/string arithmetic, compare, AND/OR) | analysed: stack model, operand typing, int/float/string paths named and commented [sure]/[likely] |
| Copied BASIC ROM arithmetic (FOUT etc.) | labelled only where referenced |
| Remaining anonymous `Lxxxx` labels | generated, not yet named |

Anonymous labels are named by address (`L2d79`), so the file stays diff-able while names are added to `names.py`.
Names with a guessed meaning carry a confidence tag in the comment; handler names such as `op3c_PRINT_str` come from
the KERNAL calls the handler makes (CHROUT, GETIN, ...) and from the operand handling, not from the original source.

Not verified dynamically: the semantic comments were derived by reading the code; only the byte-exact
reassembly is machine-checked.

## Verified dynamically
- MMU pre-configurations (VICE 3.10, `x128`, breakpoint `27FC` while the compiler runs, `bank io; m d500 d50b`): LCRA=$3F, LCRB=$7F, LCRC=$01, LCRD=$41. So A = bank 0 all RAM, B = bank 1 all RAM, C = bank 0 + ROMs.
- `rom_call` targets actually observed (VICE, breakpoint `$0287`, reading `$028B/$028C`, running the compiled test programs `expr`, `floats`, `func`, `cov2`, `ctrl` from `blitzc/tests/expected/`):
  `$4BD4` (matches `op49`, static analysis), `$4C44`, `$4C8B`, `$5017`, `$7D92`, `$7E3E`, `$A349`, `$A5BF`.
  All lie in the BASIC ROM ranges, confirming that `rom_call` is a ROM-call gateway. The addresses with no static counterpart
  (everything except `$4BD4`) come from computed targets (operator tables at `$4556/$455B`, handlers that load A/X at run time);
  they are not yet tied to individual BASIC routines. Not exhaustive: only seven short programs, first hit per run.

## ROM targets (static)
`rom_targets.txt` lists every constant `rom_call` target found in the code with its callers and the first ROM instructions
(disassembled from the C128 BASIC ROM images, lo at $4000, hi at $8000). Identified with certainty:
`$8C47` = FAC1 rounding (used by `round_fac`), `$8CFB` = `INT()` (op `$21`), `$FF6E` = KERNAL JSRFAR (SYS, op `$4E`/`$18`;
bank from `$03D5`, which `op67` = BANK sets). `$80F9` checks an error number `< $29` = `ERR$` (op `$72`, confirmed by `ROSETTA.md`).
`$4BD4` stores the BASIC text pointer in `$1200` = STOP (op `$49`).
The remaining targets are BASIC statement/function implementations (sprite, sound, graphics area `$6xxx-$8xxx`); their names are still open.

## Image 2
`IMAGE2.md`: the `$4001` runtime differs from image 1 by a 404-byte insertion (`$41A3-$4336`) that implements the graphics statements which image 1 rejects with error 35.

`runtime2.s` is the same for image 2 (`python3 mkasm.py --img2`, `make check2`, rebuild verified byte-identical, 11 328 bytes).
The image-1 names are carried over by address shift ($+2400 before the insertion, $+2591 after) and checked: of 76 labelled
routines only 5 differ in their first instructions, all benign (key operands, buffer address); the graphics front ends are
named in `names.py` (`IMG2_*`).

## Defect found in the original compiler
Image 2 in `BLITZ!.128` is 10 bytes short, so CIRCLE/PAINT/BOX/`$44` dispatch slots and the constant PI are RAM garbage in every compiled graphics program. Details: `IMAGE2.md`; fix and fixed compiler (V261117): branch `fix-graphics-slots`, folder `blitz128/fixed/`. `runtime2.s` describes image 2 with the missing bytes restored (`fix4001.py`).
