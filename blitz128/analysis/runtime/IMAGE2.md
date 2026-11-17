# Image 2 ($4001 runtime) - what the inserted code is, and the defect in the BLITZ!.128 copy used here

`../run_4001.bin` (a compiled program's runtime as executed) is the variant used for programs that contain graphics statements.
A diff against image 1 (`../run_1c01.bin`, `runtime.s`) shows one large insertion: **`$41A3-$4336` (404 bytes)** at the place of
image 1's `$1DA3`; everything behind it is shifted by `+$2591` (instead of the plain relocation `+$2400`).
`runtime2.s` is the whole image as re-assemblable source (`python3 mkasm.py --img2`, `make check2`).

## The inserted code: graphics statement front ends
- The extended-opcode table sends `$00,$3B -> $41A3` (DRAW), `$25 -> $41A8`, `$3C -> $41B9`, `$3D -> $41BE` (DRAW TO), `$3E -> $41CC` (LOCATE),
  `$3F -> $41E0` (GSHAPE), `$40 -> $4218` (SSHAPE), `$41 -> $4238` (CIRCLE), `$42 -> $4203` (PAINT), `$43 -> $4291` (BOX). Image 1 answers
  these opcodes with error 35 NO GRAPHICS AREA.
- Each handler collects its parameters (`$431C` reads the first one and checks it against 2 or 4 depending on the screen mode in `$D8`;
  `$42D5`/`$42C1`/`$42B3` store coordinate pairs in a parameter block at `$1131..`), then ends with `jmp $6650`
  (`jsr rom_call_ay / jmp next_y0`) and the address of a graphics-ROM routine in A/Y (`$9BFB`, `$9B30`, `$9DF2`, `$65A5`, `$61B6`, `$644B`, `$62D0`, ...).
- Other variables: `$1131-$1179` (graphics parameter block), `$1153-$1160`, `$80` (flag byte).
Image 1 and image 2 share the whole interpreter; image 2 only adds the graphics statement front ends, which hand over to the C128's own
graphics ROM.

## The defect: this copy of BLITZ!.128 is 10 bytes short  (fixed: `blitz128/fixed/`)
**Provenance.** The `BLITZ!.128` in this repository is a *cracked* version (the dongle check is disabled; stated by the repository owner). Whether the uncracked Skyles distribution
has the same 10-byte truncation - or whether it was introduced by the crack or by copying - is unknown. "The original" below means this untouched file.

The image-2 template in `BLITZ!.128` ends at `$6C36`, but the runtime goes on to `$6C40`. The compiler copies the full 11 328 bytes, so the
last 10 bytes of every compiled `$4001` program are whatever RAM lies behind the compiler (VICE: `00 00 00 FF FF FF FF 00 00 00`):

| `$6C37-$6C3A` | last four entries (`$41..$44`) of the low-byte table of the extended-opcode dispatch |
|---|---|
| `$6C3B-$6C40` | the float constant PI (`82 C9 0F DA A1`) and `00`, loaded by `pi_load` (image 1: `$46AA`) |

Consequences: the slots of CIRCLE/PAINT/BOX contain `$4200` (high bytes `$42` are in the file, the low bytes are garbage `00`) = the last `jmp $6650`
of the GSHAPE handler, entered with A=`$42`, Y=1, which calls `$0142` (uninitialised RAM); `π` evaluates to garbage. The correct bytes are
`38 03 91 71 82 C9 0F DA A1 00`. `fix4001.py` writes `run_4001_fixed.bin` with them; `runtime2.s` is built from that image.

### Evidence (VICE 3.10, original compiler running headless)
- Original compiler, `graphic 1,1 : circle ... : box ... : paint ... : graphic 0 : end`: `xop $41` reaches `$4200` (A=`$42` X=`$41` Y=1), then `$6650`, then `$0142`,
  which holds `FF FF FF 00 00 ...` (`ISB $FFFF,X`, `BRK`): the program never reaches END.
- Patching `38 03 91` into the three slots: all three handlers run, END reached; with the slots rotated: error 14 ILLEGAL QUANTITY (this fixed the
  CIRCLE/PAINT/BOX assignment). The bitmap at `$2000-$3FFF` then contains the box, the ellipse and the flood fill.
- The cause was found when `patch` of the three slots failed: the table slots are not in the file at all (the template ends before them).
  The tail `82 C9 0F DA A1 00` is the same in every image-1 program (`$46AA`), and `lda $46AA,x` at `$2B0D` / `lda $6C3B,x` at `$509E`
  (image 2) load it into FAC1.
- Fixed compiler (`fixed/blitz!.128.prg`, V261117, 10 bytes appended): the same program reaches END and draws; `a=π*1000` in a graphics program gives
  `45 0C` = 3141, the original never reaches END.
- The one other graphics-capable program on the disk image (`C_CRAWL`, `$4001`) has the same garbage tail; its source uses no graphics statement.
