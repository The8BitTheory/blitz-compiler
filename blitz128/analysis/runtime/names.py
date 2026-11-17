"""Names and comments for the annotated Blitz!128 runtime.
Edit here; run `make` to regenerate runtime.s and re-verify the bytes.
Confidence: [sure] verified in code / VICE trace, [likely] derived from code, [open] unknown."""

# ---- zero page ------------------------------------------------------------
# C128 BASIC conventions where the runtime reuses the ROM's arithmetic: FAC1 = $63-$68, INTFLG/VALTYP = $10/$0f.
ZP = {
    0x0f: 'valtyp',      # $FF = string, 0 = numeric (BASIC convention)
    0x10: 'intflg',      # bit7 set = current value is a 16-bit integer in fac_m3/fac_m4 ($66 hi, $67 lo)
    0x24: 'ptr24', 0x25: 'ptr25', 0x26: 'ptr26', 0x27: 'ptr27',   # scratch pointers
    0x3b: 'bcptr', 0x3c: 'bcptr_hi',   # BYTECODE POINTER (the BASIC TXTPTR slot): every handler advances it
    0x43: 'dataptr', 0x44: 'dataptr_hi',   # cursor in the DATA/line table (header 2)
    0x46: 'prevop',      # previous token class while an expression is evaluated
    0x4b: 'varptr', 0x4c: 'varptr_hi',     # address of the 7-byte slot of the variable being accessed
    0x63: 'fac_exp', 0x64: 'fac_m1', 0x65: 'fac_m2', 0x66: 'fac_m3', 0x67: 'fac_m4', 0x68: 'fac_sign',
    0x2f: 'vbase', 0x30: 'vbase_hi',       # base of the variable-slot area (7 bytes per variable) in bank 1
    0x31: 'strend', 0x32: 'strend_hi', 0x33: 'fretop', 0x34: 'fretop_hi', 0x35: 'frespc', 0x36: 'frespc_hi',  # string heap limits (BASIC names)
    0x71: 'facov',       # FAC rounding byte; bit7 set => round before use (calls ROM $8C47 via L1e42)
    0x6a: 't6a', 0x6b: 't6b', 0x6c: 't6c', 0x6d: 't6d', 0x6e: 't6e', 0x6f: 't6f',  # scratch; at start-up the six header words / patch keys
    0x7d: 'fstk', 0x7e: 'fstk_hi',         # FOR/GOSUB stack pointer (in bank 1) [likely]
    0x80: 'flags80',
}

# ---- absolute symbols -------------------------------------------------------
SYMS = {
    0xff00: 'MMU_CR', 0xff01: 'MMU_LCRA', 0xff02: 'MMU_LCRB', 0xff03: 'MMU_LCRC', 0xff04: 'MMU_LCRD',
    0xffd2: 'CHROUT', 0xffe4: 'GETIN', 0xffcf: 'CHRIN', 0xffc3: 'CLOSE', 0xffc0: 'OPEN',
    0xffc9: 'CHKOUT', 0xffc6: 'CHKIN', 0xffcc: 'CLRCHN', 0xffbd: 'SETNAM', 0xffba: 'SETLFS',
    0xffd5: 'LOAD', 0xffd8: 'SAVE', 0xffb7: 'READST', 0xff81: 'CINT', 0xff84: 'IOINIT',
    0xffe1: 'STOP', 0xfff0: 'PLOT',
    # trampolines in common RAM (copied from $1C5E at start-up, see block comment)
    0x0202: 'tr_cfgA_jmp', 0x0208: 'tr_call_vec', 0x020e: 'ld_var', 0x021d: 'st_var',
    0x022c: 'rd_zp_set', 0x022f: 'rd_zp', 0x0238: 'blkcpy_b', 0x024d: 'cmp_b',
    0x025e: 'wr_zp_set', 0x0261: 'wr_zp', 0x026a: 'tr_call_user', 0x0270: 'tr_user_ret',
    0x0276: 'print_str', 0x0287: 'rom_call', 0x0291: 'str_copy_b',
    0x028b: 'rom_call_lo', 0x028c: 'rom_call_hi',
    0x4475: 'varslot_tab-$c0',
}
# ---- labels ---------------------------------------------------------------
LABELS = {
    0x1c2f: 'start', 0x2221: 'init', 0x2288: 'init_vars',
    0x1e2a: 'decrypt_inline', 0x1e42: 'round_fac', 0x1da6: 'fout', 0x1e4f: 'fout_int',
    0x233f: 'data_ptr_init', 0x23cd: 'install_trampolines',
    0x23ae: 'rom_call_ax', 0x23b1: 'rom_call_x', 0x23c4: 'rom_call_ay', 0x23b7: 'rom_call_f9_80',
    0x2543: 'trap_reset',
    0x26ce: 'neg_int', 0x2d0a: 'pop_value', 0x2d41: 'int_to_fac', 0x2d84: 'fac_to_int',
    0x2e0f: 'get_word', 0x2e02: 'pop_get_word', 0x2e5c: 'get_byte', 0x2e24: 'get_word_signed',
    0x3a28: 'pop_byte', 0x39f7: 'file_params_init', 0x3041: 'io_status_check',
    0x4225: 'garbage_collect', 0x2178: 'alloc_string', 0x2168: 'alloc_string_x',
    0x4314: 'val_string', 0x25c5: 'hex_byte', 0x2fd3: 'fac_to_str_setup',
    0x1da3: 'gfx_ext_hook', 0x2e95: 'rom_function', 0x3f93: 'collision_reset', 0x3232: 'screen_call',
    # dispatcher
    0x27d0: 'bc_jump_ax', 0x27d4: 'next', 0x27e3: 'next_y0', 0x27e9: 'skip_a', 0x27f6: 'next_inc1_y0',
    0x27f8: 'next_inc1', 0x27fc: 'fetch', 0x2735: 'binop_dispatch', 0x278d: 'main_op', 0x279f: 'ext_op',
    0x287c: 'operand_push', 0x2864: 'var_long_or_const', 0x2992: 'const_small',
    0x27b2: 'user_return',
    0x4443: 'op_hi_tab', 0x44b5: 'op_lo_tab', 0x4535: 'varslot_tab',
    0x45b8: 'xop_hi_tab', 0x4665: 'xop_lo_tab', 0x45fc: 'decrypt_tab',
}
# opcode handlers: main opcode -> name (all others stay op_XX via HANDLER_NAMES default)
MAIN_OPS = {   # names verified against the compiler's own output (blitzc/tests/src + expected, see ROSETTA.md)
    0x0e: 'NEG', 0x0f: 'NOT', 0x10: 'DIM', 0x11: 'FOR_nostep', 0x12: 'FOR', 0x13: 'NEXT_chk', 0x14: 'NEXT',
    0x15: 'CLR', 0x16: 'JUMP_ptr52', 0x17: 'POKE', 0x18: 'SYS_x', 0x19: 'GOTO', 0x1a: 'GOSUB', 0x1b: 'ON_GOTO',
    0x1c: 'ON_GOSUB', 0x1d: 'RETURN', 0x1e: 'RESTORE', 0x1f: 'IF_skip', 0x20: 'SGN', 0x21: 'INT', 0x22: 'ABS',
    0x23: 'USR', 0x24: 'FRE', 0x25: 'POS', 0x26: 'SQR', 0x27: 'RND', 0x28: 'LOG', 0x29: 'EXP', 0x2a: 'COS',
    0x2b: 'SIN', 0x2c: 'TAN', 0x2d: 'ATN', 0x2e: 'PEEK', 0x2f: 'LEN', 0x30: 'STR_S', 0x31: 'VAL', 0x32: 'ASC',
    0x33: 'CHR_S', 0x34: 'LEFT_S', 0x35: 'RIGHT_S', 0x36: 'MID_S', 0x37: 'DEF_FN', 0x38: 'FN_call', 0x39: 'FN_end',
    0x3b: 'PRINT_3b', 0x3c: 'PRINT_semi', 0x3d: 'PRINT_comma', 0x3e: 'PRINT_nl', 0x3f: 'PRINT_cr', 0x40: 'SPC',
    0x41: 'TAB', 0x42: 'CHKOUT', 0x43: 'PRINTH_value', 0x44: 'CHKOUT_b', 0x45: 'PRINT_end',
    0x46: 'GET', 0x48: 'CHKIN', 0x49: 'STOP', 0x4a: 'READ', 0x4b: 'SCNCLR_n', 0x4c: 'WAIT', 0x4d: 'POINTER',
    0x4e: 'SYS', 0x4f: 'END', 0x50: 'INPUT_begin', 0x51: 'INPUT_str', 0x52: 'IF_THEN_line', 0x53: 'INPUT_num',
    0x54: 'MOVSPR', 0x56: 'TI_S_assign', 0x59: 'HEX_S', 0x5a: 'IF_begin', 0x5b: 'SCNCLR', 0x5c: 'COLOR',
    0x5d: 'LOAD', 0x5e: 'SAVE', 0x5f: 'VERIFY', 0x60: 'OPEN', 0x61: 'CLOSE', 0x62: 'DOS', 0x63: 'RECORD',
    0x65: 'CHAR', 0x66: 'SOUND', 0x67: 'BANK', 0x68: 'XOR', 0x69: 'BUMP', 0x6a: 'RSPCOLOR', 0x6b: 'RGR',
    0x6c: 'RCLR', 0x6d: 'POT', 0x6e: 'JOY', 0x6f: 'RDOT', 0x70: 'DEC', 0x71: 'INSTR', 0x72: 'ERR_S',
    0x73: 'MID_S_assign', 0x74: 'TRAP', 0x75: 'TRAP_off', 0x77: 'PUDEF', 0x78: 'USING', 0x79: 'VOL',
    0x7a: 'RWINDOW', 0x7b: 'STR_ARG', 0x7c: 'USING_end', 0x7d: 'RESUME', 0x7e: 'RESUME_next',
}
EXT_OPS = {    # opcode $00 xx
    0x00: 'GETKEY', 0x01: 'RREG', 0x05: 'SYS_arg', 0x09: 'PEN', 0x0a: 'PLAY', 0x0b: 'WIDTH', 0x0c: 'SPRDEF',
    0x0d: 'RSPPOS', 0x0e: 'RSPRITE', 0x0f: 'SPRCOLOR_1', 0x10: 'SPRCOLOR_2', 0x11: 'SPRSAV_to_str',
    0x12: 'SPRSAV_from_str', 0x13: 'SPRSAV_copy', 0x14: 'COLLISION', 0x16: 'WINDOW', 0x17: 'obj_select',
    0x18: 'SPRITE_enable', 0x19: 'SPRITE_color', 0x1e: 'NEW', 0x22: 'GO64', 0x23: 'TEMPO', 0x24: 'SLEEP',
    0x26: 'GRAPHIC', 0x27: 'GRAPHIC_clr', 0x28: 'GRAPHIC_split', 0x29: 'SLOW', 0x2a: 'FAST', 0x2b: 'KEY_def',
    0x2d: 'ENV_num', 0x2e: 'ATTACK', 0x32: 'WAVE', 0x33: 'PW', 0x34: 'FILTER_cutoff', 0x35: 'FILTER_lp',
    0x38: 'FILTER_res', 0x39: 'SCALE', 0x3a: 'SCALE_off', 0x44: 'reinstall',
}
EXTRA_CODE = [0x2500, 0x27b2]   # reachable only by pushed addresses / vectors
REF_LABELS = [0x4475]
HANDLER_NAMES = {}

# ---- section comments -----------------------------------------------------
COMMENT_BEFORE = {
    0x1c01: """BASIC stub (line 1):  POKE6,PEEK(981):BANK0:SYS PEEK(46)*256+47 : <HOME/ESC-@/CR>"BLITZ!"
PEEK(46) is the high byte of VARTAB -> SYS lands on `start` ($1C2F) wherever the file was loaded.""",
    0x1c2f: """start: loader. If the program was not loaded at $1C00 (VARTAB hi != $1C) it is copied up page by page,
then control passes to `init`.""",
    0x1c5e: """TRAMPOLINES ($1C5E-$1CFD, 160 bytes).  Copied to $0202.. in common RAM by install_trampolines.
MMU facts (C128): a STORE to $FF01..$FF04 (any value) selects pre-configuration A..D.
  A = $3F  bank 0, all RAM, no I/O, no ROM  (the runtime and the bytecode are the only visible code)   [sure, VICE]
  B = $7F  bank 1, all RAM                    (variables, strings, arrays)                              [sure, VICE]
  C = $01  bank 0, all ROMs (BASIC/KERNAL), no I/O   (used by rom_call and the $0300 vector)            [sure, VICE]
  D = $41  bank 1 with ROMs                   (not used by the stubs shown here)
  (values read from $D501-$D504 while the compiler runs; they are the C128 defaults.)  I/O is reached with
  `STA MMU_CR` = $02 (bank 0, I/O on, KERNAL visible) before CHROUT/GETIN/VIC/CIA access, then config A again.
They exist because the runtime executes in bank 0 but keeps all data in bank 1; every access to
variables/strings goes through one of these stubs.  Relocated listing (run-time addresses):
  0202 tr_cfgA_jmp   STA $FF01 / JMP $24C0                      back to config A, then continue at $24C0
  0208 tr_call_vec   STA $FF03 / JMP ($0300)                    call through the vector at $0300 (config C)
  020E ld_var        STA $FF02 ; Y+1 bytes (varptr),y -> $63,x   load a variable (X=Y=len-1, normally 4 or 6)
  021D st_var        STA $FF02 ; Y+1 bytes $63,x -> (varptr),y   store a variable
  022C rd_zp_set     STA $0233 (self-modify: zp pointer = A) -> falls into
  022F rd_zp         STA $FF02 ; LDA (zp),y ; back to A          read one byte of bank 1 through a ZP pointer
  0238 blkcpy_b      STA $FF02 ; copy Y bytes ($24),y -> ($37),y  string/block copy inside bank 1
  024D cmp_b         STA $FF02 ; compare X bytes (t6b),y vs (fac_m1),y   string compare, Z=equal
  025E wr_zp_set     STX $0265 (self-modify: zp pointer = X) -> falls into
  0261 wr_zp         STA $FF02 ; STA (zp),y                      write one byte to bank 1
  026A tr_call_user  STA $FF03 / JMP $0100                       run user code from the stack-page stub (SYS)
  0270 tr_user_ret   STA $FF01 / JMP user_return                 return path ($27B2)
  0276 print_str     STA $FF02; LDA (fac_m1),y; STX $FF00; JSR CHROUT; INY; CPY fac_exp   print a string from bank 1
  0287 rom_call      STA $FF03 / JSR (rom_call_lo/hi) / STA $FF01   call a BASIC/KERNAL ROM routine, then config A
  0291 str_copy_b    DEY; LDA (t6b),y; STA $FF02; EOR #$00; STA (fac_m1),y ...   copy with patchable EOR operand
rom_call is wrapped by rom_call_ax / rom_call_x / rom_call_ay (target address in A/X or A/Y).""",
    0x1d00: """$1D00: DOS status template "00, OK,00,00" (in a compiled C/ file this holds the last status string; it is also the
160-byte buffer used by VAL and INPUT#).  $1D04-$1DA2: $AA fill (program specific in compiled output).""",
    0x1da3: """---- FAC -> string and other copied BASIC-ROM arithmetic (FOUT at $1DA6) ----""",
    0x1e2a: """decrypt_inline: called with JSR directly in front of N=$68 bytes of code; pops the return address and XORs the
following 104 bytes with decrypt_tab (EOR $45FC,y).  Used to hide the key patcher ($23D0, see ANALYSE section 11).""",
    0x2221: """init: entry after the loader.  Sets VARTAB=$1C01, installs trampolines, reads header 2 (bytecode start, data table),
then init_vars parses header 1 and gives every variable a 7-byte slot.  Falls into the main loop.""",
    0x27d4: """==== MAIN LOOP / DISPATCHER ($27D0-$2B3D) ================================================
bcptr ($3B/$3C) walks the bytecode.  Each byte is XORed with the per-compile key (the operand of the
`EOR #imm` patched at start-up; $5A in the compiler itself).  Classification of the decrypted byte A:
    $00        extended opcode: next byte x -> handler xop_hi_tab/xop_lo_tab[x]          (ext_op)
    $01-$0D    binary operators, chosen by the operand type found on the stack            (binop_dispatch)
    $0E-$7F    main opcode: handler op_hi_tab/op_lo_tab[A]                                (main_op)
    $80-$BF    SECOND-OPERAND tokens (operand_push): if a left operand is already in FAC (prevop != 0) it is
               pushed on the 6502 stack first.  $80-$9F = variable (slot offset varslot_tab[A-$80]),
               $A0-$A6/$B0-$BF = small constants ($B0-$BF = integer 0-15), $A7/$A8 = 2/5-byte constants
    $C0-$DF    short variable reference, slot offset = varslot_tab[A-$C0]
    $E0-$E5    variable with long (10-bit) index / array element                          (var_long_or_const)
Handlers finish with `jmp next` ($27D4: advance 1 byte), `next_inc1`, `skip_a` (advance by A) or by loading
a new bcptr (jumps).""",
    0x4443: """==== TABLES ===============================================================================
Opcode dispatch tables are indexed by the opcode itself: op_hi_tab+x / op_lo_tab+x (valid x = $0E..$7F,
so the real data starts 14 bytes after the labelled base).  Ext table: x = 0..$44.""",
}
# $4443.. tables are emitted as plain byte runs (see mkasm.py); no explicit DATA blocks needed
DATA = []
COMMENT = {}

# ---- per-routine comments (placed above the label at that address) ---------------------------------
COMMENT_BEFORE.update({
    0x2288: """init_vars: A=$80 -> check mode.  Reads header 1 (6 bytes at $46B0, each XOR $97) into t6a..t6f:
  t6a/t6b = start of the variable-name table, t6c/t6d = its end (= end of file), t6e/t6f = size of the variable area.
Then walks the name table (2 bytes per name, XOR $B7) and hands every variable a 7-byte slot (varptr += 7).  [sure]""",
    0x233f: "data_ptr_init: dataptr = header-2 word at $46B8/$46B9 (XOR $79) = start of the DATA/line table.  [sure]",
    0x23cd: "install_trampolines: decrypt the patcher block, copy $1C5E.. to $0202.., point the error vector $0300 at the stubs.  [sure]",
    0x23ae: """rom_call_ax / rom_call_x / rom_call_ay: set the target of `rom_call` ($028B/$028C) and call a BASIC/KERNAL ROM
routine in config C, then return to config A.  A=lo, X (or Y for _ay) = hi.  [sure mechanism, targets: see callers]""",
    0x2543: "trap_reset: $120C := $FF (no TRAP active), $0300/$0301 := $3F/$4D (BASIC error vector)  [likely]",
    0x26ce: "neg_int: two's-complement negate of the 16-bit integer in fac_m3/fac_m4.  [sure]",
    0x2d0a: """pop_value: pop a value pushed by the runtime off the HARDWARE stack into FAC1 (type flag, then 2 or 5 value bytes)
and return via ($57).  Expression temporaries live on the 6502 stack.  [sure]""",
    0x2d41: "int_to_fac: convert integer in fac_m3/fac_m4 (intflg=$80) to a floating-point FAC1 (FLOAT).  [likely]",
    0x2d84: "fac_to_int: convert FAC1 to a 16-bit integer, error (jmp $24A3 = illegal quantity) if out of range.  [likely]",
    0x2e0f: "get_word: current value -> 16-bit unsigned in X(lo)/A(hi) and $16/$17; range errors jump to $24A3.  [likely]",
    0x2e5c: "get_byte: current value -> 8-bit in X (error if > 255).  Used by nearly every statement parameter.  [sure]",
    0x3a28: "pop_byte: pop the previous stack value and convert it to a byte in X (like get_byte for a saved operand).  [likely]",
    0x39f7: "file_params_init: clear the KERNAL file parameters ($B7,$B9,$19,$C6,$90), default device 1, fetch next token -> $0D.  [likely]",
    0x3041: "io_status_check: after CHKIN/CHKOUT/OPEN/CLOSE: error handling for device >=4, restores config A.  [likely]",
    0x4225: "garbage_collect: string heap compaction ($35/$36 = current heap top, $33/$34 = bound).  [likely]",
    0x2178: "alloc_string: reserve A bytes below frespc; runs garbage_collect when it would cross fretop.  [likely]",
    0x4314: "val_string: Blitz's own VAL; collects the digits 16-bit wise, then calls the BASIC ROM multiply/divide-by-10 routines.  [sure, see blitzc README]",
    0x25c5: "hex_byte: print/convert a byte as two hex digits (HEX$).  [likely]",
    0x1e42: "round_fac: ROM call $8C47 (FAC1 rounding: asl facov / increment mantissa) when facov bit 7 is set.  [sure: ROM disassembly]",
    0x1da6: "FOUT: FAC1 -> string at $0100 (copy of the BASIC ROM routine).  [sure per ANALYSE section 4.2]",
    0x3f93: "collision_reset: $120C..$120D := $FF (COLLISION / event handler bookkeeping)  [open]",
})
FAMILY_COMMENT = {
    0x0e: "---- unary operators ----", 0x10: "---- FOR / NEXT / flow control ----",
    0x3b: "---- PRINT family (CHROUT/CLRCHN; $42/$44 = PRINT# via CHKOUT) ----",
    0x46: "---- GET / INPUT / file input ----",
    0x5d: "---- LOAD / SAVE / VERIFY (device in $BA, secondary in $B9, name in $B7/$BB/$BC) ----",
    0x60: "---- OPEN / CLOSE and disk-command blocks ----",
    0x6e: "---- hardware access: joystick, sprite colour ----",
    0x74: "---- TRAP / RESUME / DO ----",
}

LABELS.update({
    0x2885: 'push_left', 0x289b: 'push_narrow_try', 0x28e6: 'push_float', 0x28fc: 'push_int',
    0x2906: 'operand_load', 0x295b: 'operand_const',
    0x2758: 'binop_int_left', 0x277d: 'binop_str_left',
    0x1f22: 'str_compare', 0x1f88: 'str_compare_len', 0x1e9e: 'str_concat',
    0x1fbd: 'fcmp', 0x2017: 'int_left_to_arg', 0x2057: 'right_to_fac', 0x2067: 'float_arith_rom',
    0x207e: 'icmp', 0x20a7: 'right_float_to_int', 0x210f: 'to_float_path', 0x2112: 'bitop_left_float',
    0x2115: 'bitop', 0x25fc: 'int_addsub_mul', 0x260f: 'int_add', 0x2621: 'int_overflow_to_float',
    0x2643: 'int_mul_check', 0x2657: 'int_mul', 0x2144: 'fac_to_int_arg',
})
COMMENT_BEFORE.update({
    0x2735: """binop_dispatch: entered with X = operator $01-$0D (also saved in $3E).  The left operand sits on the 6502 stack,
topped by its TYPE byte (pushed by push_float / push_int):
    $00        float  -> popped into ARG (t6f,t6a..t6e);  right in FAC
    bit7 set   integer-> popped into t6d/t6e
    other      string -> popped into $70/$71 (descriptor)
Operator codes: $01-$06 = comparisons, the code is a MASK  1 = less, 2 = equal, 4 = greater  (so $03 '<=', $05 '<>', $06 '>=');
$07 '+', $08 '-', $09 '*', $0A/$0B = float-only ('/', '^'), $0C = AND, $0D = OR (bit0 of $3E selects OR).  [sure from code]
Result of a comparison: -1 ($FFFF) or 0 as an integer, i.e. BASIC truth values.""",
    0x287c: """operand_push: tokens $80-$BF and $E6+.  prevop != 0 means FAC already holds a left operand: push it (push_left).
A float that is a whole number in 16 bit range is narrowed to an integer first (push_narrow_try) so integer arithmetic stays on the
fast path; otherwise the 5-byte float + sign + type go on the stack (push_float / push_int).  Then operand_load fetches the operand.  [likely]""",
    0x2057: "right_to_fac: float left operand; make the right operand float (int_to_fac) and go to fcmp ($3E<7) or float_arith_rom.  [likely]",
    0x2067: "float_arith_rom: float + - * / ^ are done by BASIC ROM routines; address from the tables at $4556 (lo) / $455B (hi) indexed by the operator.  [likely]",
    0x1fbd: "fcmp: compare ARG with FAC1 (float), produce -1/0 as integer using the operator mask in $3E.  [sure]",
    0x207e: "icmp: signed 16-bit compare of t6d/t6e with fac_m3/fac_m4, result -1/0 via mask $3E.  [sure]",
    0x20a7: "right_float_to_int: right operand is float; if it is integral and in range convert it to integer and stay on the integer path, else to_float_path.  [likely]",
    0x2017: "int_left_to_arg: left operand integer but the operation needs floats ('/' '^' or float right): convert t6d/t6e to a float in ARG.  [likely]",
    0x2115: "bitop: AND / OR of two 16-bit integers (lsr $3E: carry set = OR).  Operands that are float are converted with fac_to_int first.  [sure]",
    0x25fc: "int_addsub_mul: $07 add, $08 subtract, else multiply; overflow (V flag) falls back to float via ROM call $8D0A.  [likely]",
    0x2657: "int_mul: 16x16 shift-and-add multiply into a 32-bit accumulator (fac_m1..fac_m4); result outside 16 bit -> float.  [likely]",
    0x1f22: "str_compare: string vs string, $3E<7.  Compares the common length with cmp_b, then the lengths; result -1/0 via mask.  [likely]",
    0x1e9e: "str_concat: string + string.  Sums the lengths (>255 -> error), allocates (alloc via frespc/garbage_collect) and copies both parts with blkcpy_b.  [likely]",
})

COMMENT_BEFORE.update({
    0x3eec: """SPRITE register bit commands (ext opcodes $18,$1A-$1D).  Five entry points share one body; the entry
code is a `ldy #reg` hidden behind `bit abs` opcodes ($2C), so the entries sit inside the BIT instructions:
    $3EEC ext $18 -> Y=$15 ($D015 sprite enable)      $3EEF ext $1A -> Y=$1B ($D01B priority)
    $3EF2 ext $1B -> Y=$1D ($D01D x-expand)           $3EF5 ext $1C -> Y=$17 ($D017 y-expand)
    $3EF8 ext $1D -> Y=$1C ($D01C multicolor)
The body sets/clears the bit of sprite $77 (mask table at $45AB) in $D000,y.  [sure]""",
    0x2465: """COLLISION (ext $14/$15): parameter x=1..3, the handler line is stored encrypted (EOR $DE / $E5) in $127C,x / $1279,x,
$127F is the enable bitmask (masks at $45AB).  [likely]""",
    0x3ff1: "SPRSAV family (ext $11-$13): sprite data is 63 bytes at $0E00+n*64 (address from L406e); $11 sprite->string, $12 string->sprite, $13 sprite->sprite.  [likely]",
})
COMMENT_BEFORE.pop(0x3eec+0) if False else None

COMMENT_BEFORE.update({
    0x3fcd: """SYS (op $4E, and op $18 which first skips one token): get_word -> $03/$04 target address, $03D5 -> $02 (bank
set by the BANK statement, op $67), then KERNAL JSRFAR ($FF6E) through rom_call_ax.  [sure: target $FF6E observed in code]""",
})

COMMENT_BEFORE.update({
    0x1da3: """gfx_ext_hook: ext opcodes $3B-$43 (and $25): DRAW $3B, DRAW-TO $3D, LOCATE $3E, GSHAPE $3F, SSHAPE $40, CIRCLE $41,
PAINT $42, BOX $43 ($3C: [open]).  These graphics statements are not in the runtime: the stub jumps to $24BE, the
extension-module dispatcher (modules128.d64).  [sure for the opcode->statement map, see ROSETTA.md; hook target [likely]]""",
    0x2e95: """rom_function: ops $23-$2D (USR FRE -- SQR RND LOG EXP COS SIN TAN ATN), also $24 FRE.  The op number selects a function
vector in the BASIC ROM (table at $47D8, reached through $4C44 / $2AD2); the runtime only converts the argument and calls it.
Ops $25 (POS) and $2E (PEEK) have their own handlers.  [likely]""",
})
