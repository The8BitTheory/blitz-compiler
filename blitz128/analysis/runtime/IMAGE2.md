# Image 2 ($4001 runtime) - what the inserted code is

`../run_4001.bin` (21 900 bytes of runtime-as-executed) is the variant used for programs that contain graphics statements.
A diff against image 1 (`../run_1c01.bin`, `runtime.s`) shows one large insertion: **`$41A3-$4336` (404 bytes)** at the place
of image 1's `$1DA3`; everything behind it is shifted by `+$2591` (instead of the plain relocation `+$2400`).

What it is (read from the disassembly, not yet annotated line by line):
- Handlers for the graphics statements. The extended-opcode table of image 2 (`xop_hi/lo_tab + $2591`) sends
  `$00,$3B -> $41A3`, `$3C -> $41B9`, `$3D -> $41BE`, `$3E -> $41CC`, `$3F -> $41E0`, `$40 -> $4218` (first entries checked) -
  exactly the opcodes that image 1 answers with error 35 NO GRAPHICS AREA (DRAW, DRAW-TO, LOCATE, GSHAPE, SSHAPE, ...).
  Entries `$41-$43` all hold `$4200` (see below), which is not an instruction boundary problem: it is the `jmp $6650` at the end of the GSHAPE handler.
- Each handler collects its parameters (`$431C` reads the first one and checks it against 2 or 4 depending on the screen mode in
  `$D8`; `$42D5`/`$42C1`/`$42B3` store coordinate pairs in a parameter block at `$1131..`), then ends with
  `jmp $6650` and the address of a graphics-ROM routine in A/Y (`$9BFB`, `$9B30`, `$9DF2`, `$65A5`, `$61B6`, `$644B`, `$62D0`, ...).
- Other variables: `$1131-$1179` (graphics parameter block), `$1153-$1160`, `$80` (flag byte).

Consequence: image 1 and image 2 share the whole interpreter; image 2 only adds the graphics statement front ends, which hand
over to the C128's own graphics ROM. Programs without graphics never need it.

See `runtime2.s` (generated with `python3 mkasm.py --img2`): the whole image 2 as re-assemblable source. Table slots `$41-$43` (CIRCLE/PAINT/BOX) hold `$4200` both in the template and in a compiled program (`stmt7a`): the `jmp $6650` at `$4200` is entered with A=$42, Y=1 and so calls the RAM stub at `$0142` (filled by op `$7B`). The handlers at `$4203/$4238/$4291` have no static reference (open, maybe dead code).

## VICE trace of xop `$41` (CIRCLE)
Program `graphic 1,1 : circle 1,100,100,20,10 : box ... : paint ...` compiled by the original compiler, loaded with `load"prog",8` / `run`
(loading with `,8,1` puts the file at `$4001` where the loader then copies garbage - the loader expects to be loaded at `$1C01`).
Breakpoints: `$4200` hit with A=`$42` X=`$41` Y=1, then `$6650`, then `$0142` - which held the RAM power-up pattern (`00 00 FF FF ...`), no
code. So the CIRCLE/PAINT/BOX slots call a stub that op `$7B` (copies 36 bytes of ROM from `$9567`/`$95A3` to `$0140`) would install, but
nothing had installed it in this test. Unresolved: what the compiled program does differently in a real run (open).
