# Image 2 ($4001 runtime) - what the inserted code is

`../run_4001.bin` (21 900 bytes of runtime-as-executed) is the variant used for programs that contain graphics statements.
A diff against image 1 (`../run_1c01.bin`, `runtime.s`) shows one large insertion: **`$41A3-$4336` (404 bytes)** at the place
of image 1's `$1DA3`; everything behind it is shifted by `+$2591` (instead of the plain relocation `+$2400`).

What it is (read from the disassembly, not yet annotated line by line):
- Handlers for the graphics statements (CIRCLE/PAINT/BOX: see "Wiring bug" below). The extended-opcode table of image 2 (`xop_hi/lo_tab + $2591`) sends
  `$00,$3B -> $41A3`, `$3C -> $41B9`, `$3D -> $41BE`, `$3E -> $41CC`, `$3F -> $41E0`, `$40 -> $4218` (first entries checked) -
  exactly the opcodes that image 1 answers with error 35 NO GRAPHICS AREA (DRAW, DRAW-TO, LOCATE, GSHAPE, SSHAPE, ...).
  Entries `$41-$43` all hold `$4200` (see below), which is not an instruction boundary problem: it is the `jmp $6650` at the end of the GSHAPE handler.
- Each handler collects its parameters (`$431C` reads the first one and checks it against 2 or 4 depending on the screen mode in
  `$D8`; `$42D5`/`$42C1`/`$42B3` store coordinate pairs in a parameter block at `$1131..`), then ends with
  `jmp $6650` and the address of a graphics-ROM routine in A/Y (`$9BFB`, `$9B30`, `$9DF2`, `$65A5`, `$61B6`, `$644B`, `$62D0`, ...).
- Other variables: `$1131-$1179` (graphics parameter block), `$1153-$1160`, `$80` (flag byte).

Consequence: image 1 and image 2 share the whole interpreter; image 2 only adds the graphics statement front ends, which hand
over to the C128's own graphics ROM. Programs without graphics never need it.

See `runtime2.s` (generated with `python3 mkasm.py --img2`): the whole image 2 as re-assemblable source. See "Wiring bug" below: the slots `$41-$43` are mis-wired to `$4200`; the real handlers are `$4238/$4203/$4291`.

## VICE trace of xop `$41` (CIRCLE)
Program `graphic 1,1 : circle 1,100,100,20,10 : box ... : paint ...` compiled by the original compiler, loaded with `load"prog",8` / `run`
(loading with `,8,1` puts the file at `$4001` where the loader then copies garbage - the loader expects to be loaded at `$1C01`).
Breakpoints: `$4200` hit with A=`$42` X=`$41` Y=1, then `$6650`, then `$0142` - which held the RAM power-up pattern (`00 00 FF FF ...`), no
code. The stub at `$0140` is only written by op `$7B` (it copies 36 bytes of ROM from `$9567`/`$95A3`), which did not run: the slots are simply mis-wired (see below).

## Wiring bug: CIRCLE / PAINT / BOX (solved)
The extended-opcode slots `$41-$43` of image 2 (CIRCLE, PAINT, BOX) all contain `$4200`, the `jmp $6650` at the end of the GSHAPE
handler. Entered through the dispatcher that `jmp` is reached with A=`$42`, Y=1, i.e. it calls `$0142` - uninitialised RAM. The three real
handlers sit at `$4238` (CIRCLE), `$4203` (PAINT), `$4291` (BOX) and nothing refers to them.

Differential test (original compiler output of `graphic 1,1 : circle 1,100,100,20,10 : box 1,10,10,50,50 : paint 1,60,60 : graphic 0 : end`,
loaded with `load"prog",8` + `run` in VICE 3.10, breakpoints on the handlers, on END `$4937` and on `error_common` `$4A51`):

| table slots `$41/$42/$43` | result |
|---|---|
| as shipped (`$4200` x3) | reaches `$0142` (garbage), END is not reached within 400M cycles |
| `$4238 / $4203 / $4291` | all three handlers run, END reached, no error |
| `$4203 / $4291 / $4238` (rotated) | error 14 ILLEGAL QUANTITY (`X=$0E` at `error_common`) |

So the assignment CIRCLE=`$4238`, PAINT=`$4203`, BOX=`$4291` is confirmed, and compiled programs from this compiler version that use
these three statements run into uninitialised memory unless the table is patched. (Why: unknown - a build defect is the simplest reading;
I did not look for another mechanism that could fix the slots up at run time, and in my runs none did.)

### Follow-up checks (is it a bug?)
- **Unpatched run executes garbage.** Breakpoint on `$0142`: the bytes there are `FF FF FF 00 00 ...` (power-up RAM pattern), i.e.
  `ISB $FFFF,X` (illegal opcode), then `BRK`s. Not a deliberately installed stub.
- **Patched run draws correctly.** With the slots set to `$4238/$4203/$4291`, the bitmap at `$2000-$3FFF` after `graphic 1,1 : circle 1,100,100,20,10 :
  box 1,10,10,50,50` (dumped with the monitor at END) contains a rectangle (10,10)-(50,50) and an ellipse around (100,100); a program with only
  `graphic 1,1` leaves the bitmap all zero. (Rendered as ASCII from the dump; the headless screenshot is black.)
- **No second source.** The repository holds only this one compiler version (V860929). The only graphics-capable program compiled by the
  original author on this disk (`C_CRAWL`, load `$4001`) has the same `$4200` in the three slots, but its source uses none of the graphics
  statements (it drives the VDC), so it does not show the failure either way. No documentation is available here.
- **Verdict:** a defect of this build is by far the simplest explanation (slots point into the middle of another handler, the right handlers
  exist and work, nothing refers to them). It is not proven that no run-time mechanism ever patches the slots; none showed up in my runs.
