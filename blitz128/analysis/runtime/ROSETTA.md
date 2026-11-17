# Statement / function -> runtime opcode map

Derived from the *original* compiler's output for the test sources in `blitzc/tests/src` (`stmt1`, `stmt7a`, `stmt7b`, `cov1`,
`cov2`, `func`), read with `blitzc/tools/rosetta.py <src.bas> <expected-dir>`. The statement is identified by the opcode
that the compiler emits for it; the handler code agrees in every case checked. "x" = extended opcode, i.e. bytes `00 xx`.

| Opcode | Statement | Opcode | Statement | Opcode | Statement |
|---|---|---|---|---|---|
| `0E` | unary minus | `20` SGN | `21` INT | `22` | ABS |
| `0F` | NOT (16-bit) | `23` USR | `24` FRE | `25` | POS |
| `10` | DIM | `26-2D` | SQR RND LOG EXP COS SIN TAN ATN | `2E` | PEEK |
| `11/12` | FOR (no step / step) | `2F` LEN | `30` STR$ | `31` | VAL |
| `13/14` | NEXT | `32` ASC | `33` CHR$ | `34/35/36` | LEFT$ RIGHT$ MID$ |
| `15` | CLR | `37/38/39` | DEF FN / FN call / FN end | `3C/3D/3E` | PRINT item `;` `,` newline |
| `17` | POKE | `3F` | PRINT (CR only) | `40/41` | SPC / TAB |
| `19` | GOTO | `42/43/45` | CMD+PRINT# select / value / end | `46` | GET |
| `1A` | GOSUB | `48` | INPUT#/GET# channel (CHKIN) | `49/4F` | STOP / END |
| `1B/1C` | ON..GOTO / ON..GOSUB | `4A` | READ | `4B/5B` | SCNCLR n / SCNCLR |
| `1D` | RETURN | `4C` | WAIT | `4D` | POINTER |
| `1E` | RESTORE | `4E` | SYS | `50` | INPUT (begin) |
| `1F` | IF .. skip (false) | `51/53` | INPUT string / numeric | `52` | IF .. THEN line |
| `54` | MOVSPR | `56` | TI$= | `59` | HEX$ |
| `5A` | IF .. THEN BEGIN | `5C` | COLOR | `5D/5E/5F` | LOAD / SAVE / VERIFY |
| `60/61` | OPEN / CLOSE | `62` | disk commands (sub-opcode byte follows) | `63` | RECORD |
| `65` | CHAR | `66` | SOUND | `67` | BANK |
| `68` | XOR | `69` | BUMP | `6A` | RSPCOLOR |
| `6B/6C` | RGR / RCLR | `6D/6E/6F` | POT / JOY / RDOT | `70` | DEC |
| `71` | INSTR | `72` | ERR$ | `73` | MID$ = |
| `74/75` | TRAP / TRAP off | `77` | PUDEF | `78/7B/7C` | PRINT USING fmt / arg / end |
| `79` | VOL | `7A` | RWINDOW | `7B` | string argument marker (also after DRAW/BOX/..) |

Extended opcodes (`00 xx`):

| xx | Statement | xx | Statement | xx | Statement |
|---|---|---|---|---|---|
| `00` GETKEY | `01-04` RREG | `05-08` SYS register args | `09` PEN |
| `0A` PLAY | `0B` WIDTH | `0C` SPRDEF | `0D` RSPPOS |
| `0E` RSPRITE | `0F/10` SPRCOLOR mc1/mc2 | `11/12/13` SPRSAV | `14/15` COLLISION |
| `16` WINDOW | `17` object number (SPRITE n / MOVSPR / KEY n) | `18` SPRITE on | `19` SPRITE colour |
| `1A-1D` SPRITE priority/x-exp/y-exp/multicolor | `1E` NEW | `22` GO64 | `23` TEMPO |
| `24` SLEEP | `26/27/28` GRAPHIC mode / clear / split | `29/2A` SLOW / FAST | `2B` KEY def |
| `2D-33` ENVELOPE n, A, D, S, R, wave, pw | `34-38` FILTER cutoff, lp, bp, hp, res | `39/3A` SCALE | `3B-43` graphics hook (DRAW DRAW-TO LOCATE GSHAPE SSHAPE CIRCLE PAINT BOX) |

Not yet pinned to a statement: `3B` (main), `44`, `58`, `7F`, ext `1F-21`, `25`, `2C`, `3C`. The graphics statements `3B-43`
are not implemented in this runtime image: they raise error 35 (NO GRAPHICS AREA, `$24BE`). Programs that use graphics are
compiled with the `$4001` runtime (image 2), which has ~401 bytes of inserted code.
Corrections to earlier guesses: `xop09` is PEN (not RSPRITE), `op10` is DIM (not FOR), `op17` is POKE, `op69` is BUMP.

Image 2 detail: ext `41` CIRCLE -> handler `$4238`, `42` PAINT -> `$4203`, `43` BOX -> `$4291`. The compiled programs of the BLITZ!.128 copy in this repository (a cracked version) have `$4200` in these slots because the compiler file is 10 bytes short (see `IMAGE2.md`, fixed build in `blitz128/fixed/`).

## Additions from probe compiles (original compiler in VICE, 17.11.2026)
* `$7F nn` = statement head, present before *every* statement in full-syntax mode (menu 4-6); `nn` = statement length including the head.
  `trap n` -> `74 <word>`, `trap` -> `75`, `resume` -> `7E`, `resume next` -> `7D`, `collision n,line` -> `.. 00 15 <word>`, `collision n` -> `.. 00 14 00 00`.
  (`resume`/`collision` are "illegal command" in the restricted syntax of menu 1-3.)
* Conditions: `$52 <word>` jump if true (`if a then 10`, `loop while`, `do until`), `$5A <word>` jump if false (`if a then begin`, `do while`, `loop until`);
  `$1F nn` skips nn bytes if false (IF ... THEN statement).  `$58` has not shown up in any test (open).
* PRINT: `$3B` = bare comma (`print ,"x"` -> `3B e9'X' 3E`), `$44` = `print#1,` without items (`b1 44`).
* DEF FN `$37` has 4 operand bytes, FN call `$38` 2 operand bytes, FN end `$39`.  `00 2C` is KEY (list), not an FN opcode.
* Graphics statements carry a **flag byte** behind the extended opcode (stored unencrypted, hence `key0 XOR flag` in rosetta.py output):

| statement | form | flag |
|---|---|---|
| `draw 1,10,10` / `draw ,10,10` | absolute | `00` |
| `draw 1,+10,-10` | first pair relative | `03` |
| `draw 1,10;20` | polar | `80` |
| `draw to 5,5` | (ext `3C`, flag `00`) | `00` |
| `box 1,10,10,50,50` / `box 1,10,10` | full / first corner only | `00` / `20` |
| `box ...,50,50,45[,1]` | with angle | `10` |
| `box 1,+10,+10,50,50` / `box 1,10,10,+5,+5` | relative first / second pair | `03` / `0C` |
| `circle 1,10,10,5` / `...,5,5` / `...,5,5,0,90` | radius / +yradius / +arc | `20` / `30` / `3C` |
| `circle 1,+10,+10,5,5` | relative centre | `33` |
| `paint 1,10,10` / `paint 1,+10,+10` | | `00` / `03` |
| `sshape a$,1,1` / `,1,1,5,5` / all relative | | `20` / `00` / `0F` |
| `gshape a$,1,1` / `gshape a$,+1,+1` | | `00` / `03` |

`DRAW TO` continuation (`3D`) and `LOCATE` (`3E`) have no flag byte; their flags are an ordinary integer-constant operand
(`locate +10,+10` -> `ba ba b3 00 3e`, `locate 10;20` -> `f4 ba a6 80 00 3e`, `draw .. to +5,+5` -> `b5 b5 b3 00 3d`).

`$47` = EXTENSION (`::` command): the tokenized BASIC text of the command follows the opcode unencrypted, up to and including the closing `:` (`::poke 2001,5:` -> `47 97 20 32 30 30 31 2c 35 3a`; the compiler prints `?extensions in <line>`).
