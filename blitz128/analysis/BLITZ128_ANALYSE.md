**English** · [Deutsch](BLITZ128_ANALYSE_de.md)

# Blitz! 128 (Skyles compiler) – analysis of compiler and runtime

As of: 12 Nov 2026 · Material: `blitz!.128.prg` (45,212 bytes, load address $1C01) and `blitz-128.d81`
Labels: **[confirmed]** = verified against data/code, **[probable]** = derived from code, **[open]** = not clarified.

A note on tooling: JC64dis is a Java GUI and cannot be automated here. I therefore wrote my own 6502 disassembler (recursive, with code/data separation). It lives in `analysis/tools/`. You can retrace the listing in JC64dis if you like (addresses are identical to the load address).

---

## 1. Main result in five sentences

1. **The compiler is itself a BASIC program compiled by Blitz.** It consists of the runtime (from $1C01) plus its own bytecode, the strings and a variable table at the end.
2. **The "runtime" is a bytecode interpreter** (about 11,183 bytes, $1C01–$46AF). Compiled programs are not machine language but an XOR-obfuscated token/bytecode stream that this interpreter executes.
3. **A compiled `C/` file is: copied runtime + 41 patched key bytes + header + bytecode + variable name table.** The keys are identical for all programs (no key per program).
4. The file contains **two runtime variants**: one for BASIC start $1C01 (image 1) and one for $4001 (image 2, appended at the end, ~135 bytes longer).
5. The D81 contains **deleted original sources and compiler output** (`C/`, `Z/`, `D/`) that serve as a Rosetta stone.

---

## 2. The D81

| Entry | Finding |
|---|---|
| Active file | `BLITZ!.128` (PRG, 178 blocks) – **byte-identical** to the .prg in the folder [confirmed] |
| Deleted files | 25 entries (type $00), block chains intact except `P/LIVE6PERF15-2` (chain broken) [confirmed] |
| Sources (BASIC 7 tokenized, load $1C01) | `LIVE6B`, `LIVE6D`, `LIVE6W2`, `LIVE6W3`, `LIVE8PERF`, `LIVE10WORK`, `-B`, `-E`, `-F`, `-H`, `-I3` |
| Compiler output | `C/…` (compiled program, load $1C01, 18–19 KB), `Z/…` (address→line mapping, load $0104), `D/LIVE6` (DATA values, load $0331) |

All extracted files: `analysis/d81/`. Extractor: `analysis/tools/d81x.py`.

**Important for your question:** `C/LIVE6B`, `C/LIVE6`, `C/LIVE6PERF15-0/-1/-2` were all produced **with the runtime built in** (option 1/2). That is the reference case.

---

## 3. File layout of `BLITZ!.128`

```
$1C01-$1C2C  BASIC line 1: POKE6,PEEK(981):BANK0:SYS PEEK(46)*256+47 : <HOME/ESC-@/CR> "BLITZ!"
$1C2F-$1C5D  loader (moves the program to $1C00 if it was loaded elsewhere)
$1C5E-$1CFD  160 bytes of trampolines (bank switching) – copied to $0202 at run time
$1D00        "00, OK,00,00" (DOS status template), $1D04-$1DA0 = $AA fill (161 B, program-specific in the C/ output)
$1DA3-$44xx  runtime code (including copied BASIC FP routines, FOUT etc.)
$4443-$46AF  dispatch tables, constants
$46B0-$46B5  header 1 (6 bytes, XOR $97)
$46B6-$46C1  header 2 (XOR $79)
$46C2-...    DATA table, then bytecode (in the compiler from ≈$46F8)
...-$A064    bytecode + strings + variable name table (compiler: $9F73–$A064 = 121 names)
$A065-$CC9A  image 2: runtime variant for BASIC start $4001 (11,318 bytes)
```

The BASIC stub shows how loading works: `SYS PEEK(46)*256+47` jumps to `$2E` high byte·256+47. With normal loading that is $1C2F. The text behind the SYS is a LIST trick: it clears the screen and writes "BLITZ!".

The loader checks `$2E`. If it is not `$1C`, it copies the program page by page to $1C00 and jumps to **$2221** (main entry). Image 2 contains the same loader, which instead copies up to $4000 and jumps to $47B2. [confirmed]

---

## 4. The runtime (interpreter)

### 4.1 Initialization ($2221)
- sets `$2D/$2E` to $1C01 (VARTAB), copies the trampolines $1C5E… to `$0202` (routine `$23CD`) and redirects the error vector `$0300/$0301` to these routines [confirmed].
- `$2288` reads **header 1** (6 bytes from $46B0, each XOR $97) into `$6A–$6F` [confirmed]:
  `$6A/$6B` = start of the variable name table, `$6C/$6D` = end (= end of file), `$6E/$6F` = size of the variable area = **number of variables × 7**.
  Checked on all 6 files (e.g. `C/LIVE6B`: 46 names, 46×7 = $0142 ✓; compiler: 121 names, 121×7 = $034F ✓).
- `$2288` then walks the name table (2 bytes each, XOR $B7) and gives each name a **7-byte slot** in the variable area ($4B += 7).
- `$233F`/`$2206` read **header 2** (XOR $79): entry address, pointer to the DATA table (`$43/$44`) and TXTPTR start (`$3B/$3C`). [probable]

### 4.2 Memory model
- Program/bytecode in bank 0 from $1C01. All accesses to variables, strings and arrays go through **trampolines in common RAM** ($0202–$02A1). They write `$FF02` (MMU preconfig B), read/write via `(zp),y` and restore with `$FF01` (preconfig A). Typical entry points: `$020E`/`$021D` (get/store variable), `$022C`/`$022F` (indirect read, pointer in A), `$0238` (block copy), `$024D` (compare), `$025E/$0261`. [confirmed for the mechanism, **[probable]** that preconfig B = bank 1]
- Zero page as in the BASIC ROM: FAC1 = `$63–$68`, FAC2 = `$6A–$70`, `$10` = type flag, `$0F` = integer flag, `$33–$38` = string/array pointers. FP routines (e.g. FOUT at $1DA6, power table $4555) are **copies of the BASIC ROM arithmetic**, placed in RAM. [confirmed]

### 4.3 Main loop ($27D4–$2800)
The bytecode byte is read (`LDA ($3B),y`), XORed with the key and classified [confirmed from the code]:

| Byte (after XOR) | Meaning |
|---|---|
| `$00` + following byte `x` | **Extended opcode** → table `$45B8`(hi)/`$4665`(lo), x = 0…$44 (69 entries) |
| `$01–$0D` | Special path from `$2735` (e.g. RETURN = $01, GOSUB = $06) |
| `$0E–$7F` | **Main opcode** → table `$4443`(hi)/`$44B5`(lo), 114 entries |
| `$80–$BF` | Constants/operands (`$B0–$BF` = integer constant 0–15, `$A7–$A9` = 1/2/5-byte constants) |
| `$C0–$DF` | **Short reference to a variable** (slot offset from table `$4535`) |
| `$E0–$E5` | Variable with long index (10 bits, ×7) or array/special access |

The interpreter is thus a **token interpreter with pre-wired variable addresses**, not a name-lookup interpreter like BASIC. Hence the speed.

### 4.4 Obfuscation (all static, no program key)
The keys are **operands of `EOR #imm` instructions** in the runtime code. In the **file** `BLITZ!.128` there are `$00` placeholders there; in every generated `C/` file they are patched [confirmed, identical on 5 files].
**Correction (VICE trace, Nov 2026):** At run time the compiler **also runs with $5A** – for all 88,667 traced hits on `$2800`, `file byte XOR A = $5A` holds. So the placeholders are **patched in memory at start**, and who does it is open (the file contains no code that writes the addresses directly; a memory dump after start will clarify). My earlier statement "key $00 in the compiler" was wrong.

| Address(es) | Value in C/ file | Purpose |
|---|---|---|
| `$27A3,$27FF,$2989,…` (≈35 places) | `$5A` | **Bytecode stream** is decrypted byte by byte with $5A |
| `$22CF,$22D6` | `$B7` | Variable name table |
| `$2257,$323F` | `$EE` | Special cases (purpose [open]) |
| `$2A77` | `$3E` | String constant path (fits the $3E key of the compiler strings) [probable] |
| `$2473,$3795,$3F7F` | `$DE` | Operand bytes (lo) |
| `$247B,$379B,$3F87` | `$E5` | Operand bytes (hi) |
| `$228F` | `$97` (fixed, also in the compiler) | Header 1 |
| `$2216,$221C,$2233,$223A,$2342,$2349` | `$79` (fixed) | Header 2 |

In addition there is a **self-decryption hook** `$1E2A` (XOR with table `$45FC`, called with `JSR` before 104 bytes of code). [probable, effect not reproduced]

**Second layer for jump targets** (from the Rosetta comparison, see 6): after the $5A decryption, a 16-bit target `(b0 XOR $7D, b1 XOR $0E)` = absolute address in the program. Checked against the `Z/` table for `GOSUB 200/2000/5000/10000/11000/30000/40000` – correct in all cases (a GOSUB to a non-existent line lands on the next existing one, e.g. 40000 → 40002).

### 4.5 Opcode tables
Full list of all 114 + 69 handlers with length, Kernal calls and subroutines: **`analysis/handler_summary.txt`**. Assignments that follow from the Kernal calls [probable]:

- Main opcodes `$3B–$45`: **PRINT family** (CHROUT/CLRCHN; `$42/$44` with CHKOUT = PRINT#)
- `$46` and ext. `$00`: **GET** (GETIN)
- `$48`: CHKIN (INPUT#/GET#), `$51/$53/$55/$57`: **INPUT** variants (CHRIN)
- `$60`: **OPEN**, `$61`: **CLOSE**
- `$1E`: **RESTORE** (walks the DATA table), `$01`: **RETURN**, `$06`: **GOSUB**, `$4E`: **GOTO/THEN line**
- Many opcodes share handlers (`$2E95` for `$23–$2D,$6C,$6F` = "not allowed in this context"; `$2F85` for `$2F,$31,$32,$70`).

Constant encoding for single-character strings: `character XOR $11` (after the $5A layer), e.g. "1"→`$20`, "Q"→`$40`, "_"→`$4E`. [confirmed on the IF-I$=… lines of LIVE6B]

---

## 5. The compiler

### 5.1 Structure [confirmed]
Runtime (key at run time $5A, see 4.4) + own bytecode + string pool + 121 variables. The strings are obfuscated with **$3E** (`analysis/strings_compiler_xor3e.txt`, 234 occurrences).

### 5.2 Operation/features (from the strings)
The menu is **four-language (EN/FR/IT/DE)** and knows five modes:

1. Single program → disk **with runtime routines**
2. **All** programs of a disk → empty disk, **each** with runtime
3. All programs → empty disk, **only the first module** contains the runtime
4. All programs → empty disk (with overlay)
5. Single program → disk **without runtime routines**

Also: source/target drive (device no. 8/9…), program names, optional **formatting** of the target disk, prompt `COMPILE…`.

### 5.3 How it works [probable]
- Messages **PASS0 / PASS1 / PASS2** → at least three passes over the source program.
- Compiler error messages: *DO WITHOUT LOOP*, *LOOP WITHOUT DO*, *BEND NOT FOUND*, *SYNTAX ERROR*, *UNDEF'D STATEMENT*, *BAD SUBSCRIPT*, *OVERFLOW*, *TYPE MISMATCH*, *ILLEGAL COMMAND* (also DE/FR/IT).
- Output in four files per program: `C/NAME` (object), `Z/NAME` (line table), `D/NAME` (DATA), `P/NAME` (extra file, only name and a broken chain occupied → purpose [open]).
- Output of `C/`: the compiler writes **its own runtime** ($1C01–$46AF from memory) and patches the 41 key places. Header 1/2, bytecode and the name table follow.

### 5.4 Compiler directives in the source
The sources contain `REM ** NG`, `REM ** FI I,BI,CI,R,P,…`. The compiler string pool contains the directives **`**NE`, `**NG`, `**RI`, `**FI`, `**SP`** and `EXTENSIONS`.
- `FI var,var,…` = list of variables treated as **integer ("fast integer")** [probable]
- `NG`, `NE`, `RI`, `SP`: meaning [open] (presumably options for control structures/errors/speed; manual or comparison with the compiler logic needed)

---

## 6. Mapping source ↔ bytecode (Rosetta stone)

The file `analysis/bytecode_C_LIVE6B.txt` (420 lines) shows, per BASIC line, the $5A-decrypted bytecode. Verified fragments:

| BASIC | Bytecode (after $5A) | Finding |
|---|---|---|
| `RETURN` | `01` | confirmed |
| `GOSUB 200` | `06 3A 4D` | `06` + 16-bit target `(3A^7D, 4D^0E)` = `$4743` ✓ |
| `IF I$="1" THEN 11500` | `9B F5 20 1E 4E 30 8B` | `F5`=I$, `20`="1", `1E`=string compare "=", `4E`=GOTO target `(30^7D,8B^0E)` |
| `IF I$="Q" THEN END` | `9B F5 40 1E 03 1F 53` | `03`=END(?) + jump word |
| `GC(0)=6:GC(1)=0:…` | `AC AA F8 1B, AD AC F8 1B, …` | Array assignment, index/value as short constants |
| `IF…THEN …:IF…THEN` (line 200) | `… 05 3A 65` | `05`+word = conditional jump to end of line |
| `ON CS GOTO …` | `95 07 0A 3A 8D 3A 97 …` | List of jump words |

It follows that the compiler **resolves line numbers into absolute addresses** and drops REM lines; the `Z/` file keeps the reverse mapping address → original line.

---

## 7. Image 2 (runtime for $4001)
Structure like image 1 (same loader that copies up by $24 pages, fill area at $4104, marker `0F DA A1 00`), but **not** merely relocated: from $41A3 about 401 bytes of additional code are inserted (all later internal addresses +$2591 instead of +$2400), total length 11,318 B. The inserted code works with other variables ($1131/$1155…) and calls many helper routines. [confirmed as a variant, **purpose [probable]**: runtime for programs that occupy the graphics area and therefore start at $4001]. It is not executed in compiler image 1.

---

## 7b. Results of the VICE run (13 Nov 2026)
Setup: GTK3VICE 3.7 (x128), `work8.d81` (BLITZ!.128 + `CRAWL` = `crawl.prg` from the repo `dungeoncrawlerjam2025`) in drive 8, `work9.d81` (empty) in drive 9. Tracepoint `trace exec 2800` with `m 3b 3c` (log in `crawl/trace.log`, 18 MB).

- **The main loop of the runtime is as described** (`$27FC: LDA ($3B),Y / EOR #key / BEQ $279F`; `$3B/$3C` = bytecode pointer). All 88,667 hits: `file[ptr] XOR A = $5A`. [confirmed]
- **Operand lengths** (distance to the next opcode), from the trace, in detail in `opcode_stats_trace.txt` [confirmed for the opcodes named]:
  - `$B0–$BF`: 1 byte (integer constant 0–15)
  - `$A0, $A4, $A6`: opcode + 1 byte; `$A7`: + 2 bytes (16-bit constant); `$A8`: + 5 bytes (floating-point constant)
  - `$E0–$E5`: opcode + 1 byte (variable with long index)
  - **`$E8–$EE`: string constant, length = opcode − $E8, followed by the characters**; `$E7` + length byte for longer strings
  - `$01–$0E, $81–$8F, $F0–$FF` and others: 1 byte (operators/statements without operand)
  - Jump/control opcodes (`$13, $19, $1A, $1B, $1D, $1F, $52, $58`) show mixed distances because they branch
- **`P/NAME` is an intermediate file between the passes** (SEQ file, written first during the compile and kept open, first stored in the compile of CRAWL: `P/CRAWL`). [confirmed for the occurrence, contents not yet evaluated]

## 8. What is open
1. **Complete bytecode decompiler**: the operand formats of the ~180 opcodes are only known in fragments. The way there: derive the operand length from `handler_summary.txt` for each handler (tail `LDA #n / JMP $27E9`) and compare with more Rosetta lines. Then the **compiler bytecode itself** can also be translated back to BASIC.
2. The area from ≈$46F8 in the compiler looks (repeating pattern) like DATA tables, not code. **Where the compiler code starts is still open.**
3. Contents of `P/…` (intermediate file), directives `NE/NG/RI/SP`, meaning of opcodes `$01–$0D`.
4. **Overlay/chain mode** (menu items 3/4): how subsequent modules without runtime access the runtime of the first has not been investigated (the existing `C/` examples all contain the runtime).
5. Dynamic verification is missing: a run in VICE (`x128`) with a monitor trace of `$27FC` would confirm every assumption in section 4.3 at once and quickly close the open opcodes.

## 9. Files
| Path (`blitz128/analysis/`) | Contents |
|---|---|
| `runtime_1c01.asm` | Recursive listing of the runtime $1C2F–$46AF (5,693 lines) |
| `handler_summary.txt` | All opcode handlers with length/Kernal/subroutines |
| `strings_compiler_xor3e.txt` | Menu/error texts of the compiler (4 languages) |
| `bytecode_C_LIVE6B.txt` | Source ↔ decrypted bytecode, line by line |
| `d81/` | all (including deleted) files of the D81 |
| `tools/` | `dis6502.py`, `rtdis.py`, `mklist.py`, `handlers.py`, `bas7.py`, `zmap.py`, `d81x.py`, `bcdump.py` |

## 10. Addendum: results of the CRAWL compile run (mem.bin, C_CRAWL)

- **Image 2 = runtime template for $4001 outputs.** The first 11318 bytes ($4001-$6C36) of `C_CRAWL.prg` are byte-identical to "image 2" in the compiler (0 differences). The compiler writes this template unchanged and appends header + XOR bytecode + variable table. Image 1 (load $1C01, 41 patch places) is used for $1C01 outputs instead.
- **mem.bin vs. file (after a complete compile):** only 53 bytes differ: DOS status text $1D00-$1D0C plus the 41 key patch places (placeholder $00 in the file -> $5A/$B7/$EE/$DE/$E5/$3E in memory). So there is no code decryption; the keys are patched into memory at start.
- **Trace $27FC:** the key for the bytecode is $5A throughout (all 88,667 hits).
- **P_CRAWL** is the intermediate file between the passes; C_/Z_/D_CRAWL are object, address-line map and DATA values.
- **Open:** directly behind the template ($6C37) are `00 00 00 ff ff ff ff 00 00 00 28 03 1a 02 46 95 ...`; this does not fit the header-1 scheme (^$97). The position of header 1/header 2/variable name table in the $4001 format is not yet confirmed. Also open: who writes the 41 patches at start (startup trace from program start needed), and the operand lengths of the jump opcodes $13,$19,$1A,$1B,$1D,$1F,$52,$58.

## 11. Who patches the 41 key places? (VICE run 15 Nov 2026) [confirmed]

**Answer: the runtime itself, with self-decrypting code.** The listing in `runtime_1c01.asm` from `$23CF` is *encrypted* in the file (it only looks randomly plausible). The call `JSR $1E2A` at `$23CD` decrypts the 104 ($68) bytes from `$23D0` in place (`EOR $45FC,y`) and returns into the decrypted code. At the end the code jumps to `$1E35` with a pushed return address and thereby encrypts itself again. That is why `mem.bin` shows the same bytes as the file at this place.

Decrypted patcher (`$23D0`):
```
LDX #0 : LDA #$2F
L: EOR $46BC,X : STA $6A,X : INX : CPX #6 : BNE L   ; running XOR chain
STA $2257,$323F                 ; $6F  = $EE
LDA $6B : STA $2A77             ; $6B  = $3E
LDA $6C : STA $22CF,$22D6       ; $6C  = $B7
pointer $24/$25 = $27A0, Y=3, until hi byte = $40:
   LDA $6A : STA ($24),Y        ; $6A  = $5A
   scan: next place where (ptr+0..2) == B1 3B 49 (= LDA ($3B),Y ; EOR #imm)
LDA $6D : STA $2473,$3795,$3F7F ; $6D  = $DE
LDA $6E : STA $247B,$379B,$3F87 ; $6E  = $E5
```
- **Key = XOR chain over 6 bytes from `$46BC`** with start value `$2F`: `75 64 89 69 3B 0B` gives `$6A..$6F = 5A 3E B7 DE E5 EE`. These are exactly the observed values. So the keys are hidden in header 2 (bytes `$46BC–$46C1`, for `$4001` programs `$6C4D–$6C52`). **Correction:** they are **random per compile**. Three compiles of CRAWL give three different sets, and `C_LIVE6B` runs with bytecode key `$46` (confirmed in VICE). The `$5A` values at the patch places of the `C/` files are only leftovers from the compiler's memory, because it saves its own, already patched runtime. The Rosetta evaluation in section 6 (`$5A` on LIVE6B) was therefore done with the wrong key and has to be repeated with `$46`.
- The `$5A` places are **all** `EOR #imm` operands directly behind `LDA ($3B),Y` (signature `B1 3B 49`) in the range `$27A0–$3FFF`, plus `$27A3` directly. That is 29 places. The four hits `$3795/$379B/$3F7F/$3F87` are overwritten afterwards with `$DE`/`$E5`.
- Why the trace breakpoints showed nothing so far: the first hit on `$27FF` was the Kernal LOAD (`$02B8`, A=`$00`). The real patch happens at `$23FF` (`STA ($24),Y`, A=`$5A`), in the decrypted code, which a static listing of the file does not show.
- **Dual use:** the patcher encrypts itself again at the end (`JMP $1E35`). The encrypted bytes `$23D0–$2437` are at the same time valid opcode handlers (jump targets `$23E6`, `$23F4`, `$23FA`, `$240F`, `$2415` …). The old listing is therefore **correct** for run time there. I stored the patcher separately (`patcher_1c01.bin`, `patcher_4001.bin`), the run-time image is in `run_1c01.bin`/`run_4001.bin` (tool `tools/runimg.py`), the listing in `runtime_1c01_run.asm`.
- (superseded:) `runtime_1c01.asm` is data garbage in the range `$23D0–$2437`. The range has to be decrypted with `EOR $45FC,y`. One should also check whether `JSR $1E2A` encrypts further code elsewhere (especially in the compiler part and in image 2).

Setup to reproduce: VICE 3.9 from source, `--enable-headlessui`, `x128 -warp -sounddev dummy -drive8type 1581 -8 d.d81 -moncommands t.mon -limitcycles 40000000 -keybuf 'load"blitz!.128",8\nrun\n'`, monitor `trace store 27ff`.

---

## 12. Defect: image 2 is 10 bytes short (found 17.11.2026)
The `$4001` runtime appended to `BLITZ!.128` ends at `$6C36`, but the runtime needs it up to `$6C40`. The compiler copies the full
11 328 bytes, so the last 10 bytes of every `$4001` output come from RAM behind the compiler (`00 00 00 FF FF FF FF 00 00 00` in VICE).
They are the last four entries (`$41-$44`) of the extended-opcode low-byte table (CIRCLE, PAINT, BOX, `$44`) and the constant PI.
Result: CIRCLE/PAINT/BOX call uninitialised RAM at `$0142`, `π` is garbage. Fix: `fixed/` (see `fixed/README.md`), appended bytes
`38 03 91 71 82 C9 0F DA A1 00`. Earlier statements here about image 2 and the "RAM pattern behind the template" describe the symptom.
