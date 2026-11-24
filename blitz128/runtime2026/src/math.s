; math.s -- Improved 2026 runtime, FASTMATH variant: fast floating-point multiplication, bit-identical to the C128 BASIC ROM.
;
; ROM FMULTT ($8A27, ~2500 cycles) multiplies the 32-bit ARG mantissa A ($6B-$6E) by the FAC bytes $71, $67, $66, $65, $64 with a
; shift-and-add loop (8 iterations per byte) into the 40-bit window W = $28 $29 $2A $2B $71.  Eight iterations of that loop with the
; byte b are exactly  W = (W >> 8) + A*b  (all intermediate values fit, the dropped bits are the same), so one table multiplication
; per byte gives the same window.  The ROM's quirks are reproduced:
;   * $71, $65, $64 always go through the bit loop ($8A5B); $67 and $66 go through $8A55, which for a zero byte jumps to the shift
;     routine $8962 instead: W >> 8 with the byte at $03DF moved into the top, and if the carry was clear on entry (the byte before
;     also was zero) an extra arithmetic shift right of $28-$2B by one bit ($71 keeps its value).  The carry is clear after $8962
;     and set after the bit loop.
;   * exponent handling ($8AEC), zero and overflow cases, then MOVFR + NORMAL ($8BC1 -> $88B6, called in the ROM).
; A*b uses quarter squares: a*b = f(a+b) - f(b-a), f(n) = floor(n*n/4), tables sq1[x] = f(x) and sq2[x] = f(x-255) (x = 0..511,
; 2 KB), built by fm_init in free bank-0 RAM behind the program; without room there FASTMATH stays off (ROM routines).
; Entry points:  fast_fmultt (= $8A27), fm_mult_mem (= $8A08), fm_mult_bank (= $8A24), m_8AEE/m_8B09 (MULDIV, used by the EXP copy);
;                fm_op  replaces `jsr rom_call_x` in float_arith_rom (operators * and ^),
;                fm_func replaces `jmp rom_ax_tail` in rom_function (SQR LOG EXP COS SIN TAN ATN -> copies in mathcopy.s).
        .setcpu "6502"
        .include "rtsyms.inc"
        .import m_89CA, m_8FB7, m_8FC1, m_9033, m_9409, m_9410, m_9459, m_94B3
        .import shadow
        .export fast_fmultt, fm_mult_mem, fm_mult_bank, m_8B09, m_8AEE, fm_op, fm_func, fm_init
        .segment "EXT"

w0 = $28                           ; the ROM's result window (RESHO) + facov
w1 = $29
w2 = $2a
w3 = $2b
w4 = facov
a0 = $6b                           ; ARG mantissa, a0 = most significant
a1 = $6c
a2 = $6d
a3 = $6e

; ---------------------------------------------------------------- init: tables behind the program
; header 1 word 2 (shadow+2/3, XOR $97) = end of the program file
fmoff:  rts
fm_init:
        lda  #0
        sta  fm_on
        lda  shadow+2
        eor  #$97
        cmp  #1                    ; C = 1 when the low byte is not 0: round up to the next page
        lda  shadow+3
        eor  #$97
        adc  #0
        sta  tpage
        clc
        adc  #8
        bcs  fmoff
        cmp  #$81                  ; tables must end at or below $8000 (visible with MMU CR=$02 as well)
        bcs  fmoff
        ; sq1: f(0..511), lo at tpage+0/1, hi at tpage+2/3
        lda  tpage
        sta  @l1+2
        clc
        adc  #2
        sta  @h1+2
        lda  #0
        sta  acc
        sta  acc+1
        sta  ginc
        sta  ginc+1
        ldx  #2                    ; two pages
        ldy  #0
@g1:    lda  acc
@l1:    sta  $ff00,y
        lda  acc+1
@h1:    sta  $ff00,y
        ; f(n+1) = f(n) + floor((n+1)/2): inc runs 0,1,1,2,2,3,...  (n = page*256 + y)
        tya
        and  #1
        beq  @e1
        inc  ginc
        bne  @e1
        inc  ginc+1
@e1:    clc
        lda  acc
        adc  ginc
        sta  acc
        lda  acc+1
        adc  ginc+1
        sta  acc+1
        iny
        bne  @g1
        inc  @l1+2
        inc  @h1+2
        dex
        bne  @g1
        ; sq2[x] = f(|x-255|) = sq1[|x-255|], lo at tpage+4/5, hi at tpage+6/7
        lda  tpage
        sta  @rl+2
        sta  @rl2+2
        clc
        adc  #2
        sta  @rh+2
        sta  @rh2+2
        adc  #2
        sta  @wl+2
        adc  #2
        sta  @wh+2
        ldy  #0                    ; x = 0..255: |x-255| = 255-x
@g2:    tya
        eor  #$ff
        tax
@rl:    lda  $ff00,x
@wl:    sta  $ff00,y
@rh:    lda  $ff00,x
@wh:    sta  $ff00,y
        iny
        bne  @g2
        inc  @wl+2
        inc  @wh+2
@g3:    tya                        ; x = 256..511: |x-255| = y+1 (y = x-256) -> 1..256
        tax
        inx
        beq  @x256
@rl2:   lda  $ff00,x
        sta  @v+1
@rh2:   lda  $ff00,x
        jmp  @w
@x256:  lda  #<16384               ; f(256) = 16384
        sta  @v+1
        lda  #>16384
@w:     ldx  @wh+2
        stx  @wh3+2
        ldx  @wl+2
        stx  @wl3+2
@wh3:   sta  $ff00,y
@v:     lda  #0
@wl3:   sta  $ff00,y
        iny
        bne  @g3
        ; patch the page bytes of the product code: +3 sq1_lo, +6 sq2_lo, +12 sq1_hi, +15 sq2_hi (each product is 19 bytes)
        ldx  #3*19
@p:     lda  tpage
        sta  prod0+3,x
        clc
        adc  #2
        sta  prod0+12,x
        adc  #2
        sta  prod0+6,x
        adc  #2
        sta  prod0+15,x
        txa
        sec
        sbc  #19
        tax
        bcs  @p
        lda  #$80
        sta  fm_on
@off:   rts

fmzero: lda  #0                    ; $8B0F/$88D6: result 0 (the ROM returns from FMULT)
        sta  fac_exp
        sta  fac_sign
        rts
ovf:    jmp  t_895D                ; OVERFLOW error, raised by the ROM as in the original
; ---------------------------------------------------------------- FMULT with memory operand: CONUPK in the ROM, then fast_fmultt
fm_mult_mem:                       ; = $8A08: ARG = (A,Y) (ROM constant or RAM), FAC = FAC * ARG
        jsr  t_8A89
        jmp  fast_fmultt
fm_mult_bank:                      ; = $8A24: same with the bank-aware CONUPK ($8AB4)
        jsr  t_8AB4
        ; falls through
; ---------------------------------------------------------------- FMULTT: FAC = FAC * ARG
fast_fmultt:
        lda  fac_exp
        bne  @go
        rts
@go:    ; exponent ($8AEC)
        lda  $6a
        beq  fmzero
        clc
        adc  fac_exp
        bcc  @nc
        bmi  ovf
        clc
        bcc  @a80
@nc:    bpl  fmzero
@a80:   adc  #$80
        sta  fac_exp
        bne  @sg
        sta  fac_sign              ; $88DA: exponent 0 -> sign 0, the ROM goes on multiplying
        beq  @mul
@sg:    lda  $70
        sta  fac_sign
@mul:   ; set the table offsets of the four products: sq1 + a_i, sq2 + (255 - a_i)
        lda  a0
        sta  prod0+2
        sta  prod0+11
        eor  #$ff
        sta  prod0+5
        sta  prod0+14
        lda  a1
        sta  prod1+2
        sta  prod1+11
        eor  #$ff
        sta  prod1+5
        sta  prod1+14
        lda  a2
        sta  prod2+2
        sta  prod2+11
        eor  #$ff
        sta  prod2+5
        sta  prod2+14
        lda  a3
        sta  prod3+2
        sta  prod3+11
        eor  #$ff
        sta  prod3+5
        sta  prod3+14
        ; window: W = 0 0 0 0 facov; step 1 = facov (bit loop): W = A*facov
        lda  #0
        sta  w0
        sta  w1
        sta  w2
        sta  w3
        ldy  w4
        jsr  step                  ; carry is "set" after a bit-loop step
        ldy  fac_m4                ; $67 via $8A55
        bne  @m4
        jsr  mulshf_c1
        ldy  fac_m3                ; $66 via $8A55, the byte before was zero
        bne  @m3
        jsr  mulshf_c0
        jmp  @m2
@m4:    jsr  step
        ldy  fac_m3
        bne  @m3
        jsr  mulshf_c1
        jmp  @m2
@m3:    jsr  step
@m2:    ldy  fac_m2                ; $65, $64 via the bit loop
        jsr  step
        ldy  fac_m1
        jsr  step
        ; MOVFR ($8BC1) + NORMAL ($88B6, in the ROM)
        lda  w0
        sta  fac_m1
        lda  w1
        sta  fac_m2
        lda  w2
        sta  fac_m3
        lda  w3
        sta  fac_m4
        lda  #$b6
        sta  rom_call_lo
        ldx  #$88
        jmp  rom_call_x

; W = (W >> 8) + A*b,  b in Y
step:   tya
        bne  @mul
        lda  w3                    ; b = 0: shift only
        sta  w4
        lda  w2
        sta  w3
        lda  w1
        sta  w2
        lda  w0
        sta  w1
        lda  #0
        sta  w0
        rts
@mul:
prod0:  sec                        ; a0*b -> t0l/t0h  (operands patched: sq1_lo+a0, sq2_lo+~a0, sq1_hi+a0, sq2_hi+~a0)
        lda  $ff00,y               ; +2: low byte (a), +3: page
        sbc  $ff00,y               ; +5 / +6
        sta  t0l
        lda  $ff00,y               ; +11 / +12
        sbc  $ff00,y               ; +14 / +15
        sta  t0h
prod1:  sec
        lda  $ff00,y
        sbc  $ff00,y
        sta  t1l
        lda  $ff00,y
        sbc  $ff00,y
        sta  t1h
prod2:  sec
        lda  $ff00,y
        sbc  $ff00,y
        sta  t2l
        lda  $ff00,y
        sbc  $ff00,y
        sta  t2h
prod3:  sec
        lda  $ff00,y
        sbc  $ff00,y
        sta  t3l
        lda  $ff00,y
        sbc  $ff00,y
        sta  t3h
        ; pass 1: shifted W + a3*b + (a1*b << 16)
        clc
        lda  w3
        adc  t3l
        sta  w4
        lda  w2
        adc  t3h
        sta  w3
        lda  w1
        adc  t1l
        sta  w2
        lda  w0
        adc  t1h
        sta  w1
        lda  #0
        adc  #0
        sta  w0
        ; pass 2: + (a2*b << 8) + (a0*b << 24)
        clc
        lda  w3
        adc  t2l
        sta  w3
        lda  w2
        adc  t2h
        sta  w2
        lda  w1
        adc  t0l
        sta  w1
        lda  w0
        adc  t0h
        sta  w0
        rts

; $8962 with carry set: W >> 8, ($03DF) into the top byte
mulshf_c1:
        lda  w3
        sta  w4
        lda  w2
        sta  w3
        lda  w1
        sta  w2
        lda  w0
        sta  w1
        lda  $03df
        sta  w0
        rts
; $8962 with carry clear: the same, then $28-$2B arithmetic shift right by 1 ($71 unchanged)
mulshf_c0:
        jsr  mulshf_c1
        lda  w0
        asl  a
        ror  w0
        ror  w1
        ror  w2
        ror  w3
        rts

; ---------------------------------------------------------------- $8AEE / $8B09 (MULDIV, used by the EXP copy)
; Both exits for a result that is too small do `PLA PLA` (return 0 from the caller). Called through a thunk, that would remove the
; trampoline's frame instead, and the RTS would land in the RAM copy with the ROM switched in (mathcheck: EXP(-88.5)), so this is RAM code.
; $8AEE: entered with A = ARG exponent ($6A) and its flags.  $88D6/$88DA (zero the FAC) are inline.
m_8AEE: beq  md_zero
        clc
        adc  fac_exp
        bcc  @c
        bmi  md_ovf
        clc
        bcc  @a                    ; ROM: `.byte $2C` over the BPL
@c:     bpl  md_zero
@a:     adc  #$80
        sta  fac_exp
        bne  @s
        sta  fac_sign              ; $88DA with A = 0
        rts
@s:     lda  $70                   ; sign of the result (ARG sign xor FAC sign)
        sta  fac_sign
        rts
m_8B09: lda  fac_sign
        eor  #$ff
        bmi  md_ovf
md_zero:
        pla
        pla
        lda  #0                    ; $88D6
        sta  fac_exp
        sta  fac_sign
        rts
md_ovf: jmp  t_895D

; ---------------------------------------------------------------- hooks
; float_arith_rom: `lda fac_exp / jsr rom_call_x` with rom_call_lo/X = ROM routine of the operator
fm_op:  bit  fm_on
        bpl  @rom
        cpx  #$8a
        bne  @pw
        ldy  rom_call_lo
        cpy  #$27
        bne  @rom
        lda  fac_exp
        jmp  fast_fmultt
@pw:    cpx  #$8f
        bne  @rom
        ldy  rom_call_lo
        cpy  #$c1
        bne  @rom
        lda  fac_exp               ; FPWR starts with BEQ on the exponent
        jmp  m_8FC1
@rom:   lda  fac_exp
        jmp  rom_call_x

; rom_function: `lda #$44 / ldx #$4c / jmp rom_ax_tail` with Y = 2 * function number (ROM vector table $47D8)
fm_func:
        bit  fm_on
        bpl  @rom
        cpy  #28
        bcs  @rom
        lda  ftab+1,y
        beq  @rom
        sta  @j+2
        sta  $58                   ; $4C44 leaves the vector in $57/$58 (= the ROM address of the function)
        lda  ftab,y
        sta  @j+1
        sta  $57
@j:     jsr  $ffff
        jmp  next_inc1_y0          ; = rom_ax_tail after rom_call_ax ($77DA only checks for a numeric result)
@rom:   lda  #$44
        ldx  #$4c
        jmp  rom_ax_tail
; Y/2: SGN INT ABS USR FRE POS SQR RND LOG EXP COS SIN TAN ATN  (0 = keep the ROM)
ftab:   .word 0, 0, 0, 0, 0, 0, m_8FB7, 0, m_89CA, m_9033, m_9409, m_9410, m_9459, m_94B3

; ---------------------------------------------------------------- ROM calls (through rom_call: A, X, Y, flags preserved)
t_8A89: php
        pha
        lda  #<$8a89
        sta  rom_call_lo
        lda  #>$8a89
        sta  rom_call_hi
        pla
        plp
        jmp  rom_call
t_8AB4: php
        pha
        lda  #<$8ab4
        sta  rom_call_lo
        lda  #>$8ab4
        sta  rom_call_hi
        pla
        plp
        jmp  rom_call
t_895D: lda  #<$895d
        sta  rom_call_lo
        lda  #>$895d
        sta  rom_call_hi
        jmp  rom_call

; ---------------------------------------------------------------- data
fm_on:  .byte 0                    ; $80 = tables built, fast routines active
tpage:  .byte 0
acc:    .word 0
ginc:   .word 0
t0l:    .byte 0
t0h:    .byte 0
t1l:    .byte 0
t1h:    .byte 0
t2l:    .byte 0
t2h:    .byte 0
t3l:    .byte 0
t3h:    .byte 0
        .assert prod1-prod0 = 19 && prod2-prod1 = 19 && prod3-prod2 = 19, error, "product block size"
