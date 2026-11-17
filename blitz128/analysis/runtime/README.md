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
| ~90 opcode handlers | labelled `opXX_NAME` where the function is clear, otherwise `opXX` |
| Ext. opcodes (`$00 xx`) | labelled `xopXX`; sprite (`$18,$1A-$1D`, SPRSAV `$11-$13`), COLLISION, VIC colour, wave select named; sound/graphics parameter handlers (`$26-$38`, `$1F-$21`) still `[open]` |
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
bank from `$03D5`, which `op67` = BANK sets). `$80F9` checks an error number `< $29` (likely `ERR$`, op `$72`).
`$4BD4` stores the BASIC text pointer in `$1200` (STOP/END family, op `$49`).
The remaining targets are BASIC statement/function implementations (sprite, sound, graphics area `$6xxx-$8xxx`); their names are still open.
