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
