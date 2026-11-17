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
are not implemented in the runtime itself: they jump to the extension dispatcher at `$24BE`.
Corrections to earlier guesses: `xop09` is PEN (not RSPRITE), `op10` is DIM (not FOR), `op17` is POKE, `op69` is BUMP.
