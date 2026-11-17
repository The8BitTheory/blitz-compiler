# Fixed Blitz!128 compiler (V261117)

`blitz!.128.prg` here is the original Skyles `BLITZ!.128` (V860929) with one defect repaired. It is made by
`../blitzc/tools/patch_blitz128.py` (which checks that its input is the untouched original, sha1 `de85d699...`).
The title screen shows **V261117** (yymmdd of the fix); the original shows V860929. The original file is left untouched.

## The defect
`BLITZ!.128` contains two runtime images that the compiler copies into every compiled `C/` file: image 1 for normal programs and
image 2 (loads at `$4001`) for programs with graphics statements. The file is **10 bytes too short**: image 2 ends at `$6C36`
(file size 45 212) although the runtime needs it up to `$6C40`. The compiler writes the full 11 328 bytes, so the last 10 come from
whatever RAM lies behind the compiler (in an emulator the power-up pattern `00 00 00 FF FF FF FF 00 00 00`; undefined on real hardware).

Those 10 bytes are:

| address | meaning | effect of the garbage |
|---|---|---|
| `$6C37-$6C3A` | last four entries (`$41..$44`) of the low-byte table of the extended-opcode dispatch | `CIRCLE`, `PAINT`, `BOX` (and opcode `$44`) jump into the middle of another handler and then call uninitialised RAM at `$0142` - the program runs wild |
| `$6C3B-$6C40` | the 5-byte float constant PI (`82 C9 0F DA A1`) plus `00`, loaded by the PI handler | `π` evaluates to garbage in every program that uses graphics statements |

Image 1 (programs without graphics) is complete and unaffected.

## The fix
Append the missing bytes `38 03 91 71 82 C9 0F DA A1 00` (file size 45 222):
CIRCLE -> `$4238`, PAINT -> `$4203`, BOX -> `$4291`, `$44` -> `$4D71` (the high bytes `$42 $42 $42 $4D` were already in the file), PI as in image 1.
Compiled programs have to be recompiled; nothing else changes (keys, headers, image 1 are as before).

## How it was checked (VICE 3.10, `x128`, original compiler running headless)
* Program `graphic 1,1 : circle 1,100,100,20,10 : box 1,10,10,50,50 : paint 1,60,60 : graphic 0 : end`:
  original compiler output never reaches `END`; fixed compiler output runs to `END`, bitmap `$2000-$3FFF` shows the box, the ellipse and the fill.
* Program `graphic 0 : a=π*1000 : poke 2000,lo : poke 2001,hi`: original - `END` not reached; fixed - `$07D0/$07D1 = 45 0C` = 3141.
* Differential test (before the cause was understood): putting `38 03 91` into the three table slots of an original output is
  enough to make CIRCLE/BOX/PAINT work; rotating them gives error 14 ILLEGAL QUANTITY. This fixed the handler assignment.
* The JavaScript port (`../blitzc/js`) embeds this fixed build; `../blitzc/tools/chrome-test.py` (or `node js/test.js`) rebuilds all 57
  reference outputs byte for byte, and two outputs of the fixed original compiler (above) byte for byte.

## Use
Real disk: copy `blitz!.128.prg` onto your Blitz disk under the name `BLITZ!.128`, e.g. with VICE's `c1541`:
`c1541 -attach disk.d81 -delete "blitz!.128" -write blitz\!.128.prg "blitz!.128"`.
Programs compiled **before** the fix that use graphics statements or π must be recompiled with it.
