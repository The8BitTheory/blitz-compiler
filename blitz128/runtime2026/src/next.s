; next.s -- Improved 2026 runtime: NEXT.
;
; 1. Floating-point loop variable (the normal case without **FI): op13_NEXT_chk adds STEP (FAC, from the FOR stack) to the variable
;    (ARG = t6a exp, t6b..t6e mantissa, sign in t6f) with ROM FADD ($8848, ~360 cycles) and rounds with ROM $8C47.
;    fast_next_add does it exactly when STEP is a whole number -255..255 and the variable is >= 1 and < 2^31 (whole or not):
;    STEP is added at the bit position of 1.0 in the 32-bit mantissa (no alignment shifts), at most one normalisation shift.
;    For these operands FADD computes the same: no bit is lost, the rounding byte stays 0, so the result is bit-identical.
;    Every other case (fractional or large STEP, negative variable, 0 < variable < 1, a 1 lost when normalising, more than one
;    left shift) takes the original ROM path.  Variable = 0: the sum is STEP, which already is in FAC.
;    Patch: NEXT `lda #$48 ... jsr rom_call_x : jsr round_fac` (15 bytes) -> `jsr fast_next_add : jmp <behind>`.
; 2. NEXT loads and stores the loop variable with `jsr ld_var` / `jsr st_var` (trampoline loop); those four calls go to unrolled
;    copies in the shared page, through stubs (the MMU may be at CR=$02 after FAST/SLOW or a VIC statement).
        .setcpu "6502"
        .include "rtsyms.inc"
        .segment "EXT"
        .export fast_next_add, stub_next_ld5, stub_next_st5, stub_next_ld2, stub_next_st2
slow:   lda  #$48                  ; original code: FADD + rounding in the ROM
        sta  rom_call_lo
        ldx  #$88
        lda  fac_exp
        jsr  rom_call_x
        jmp  round_fac
fast_next_add:
        ; --- STEP = +1.0 (the usual loop): one bit at position exp-$81 of the variable's mantissa ---
        lda  fac_exp
        cmp  #$81
        beq  @e1
        jmp  general
@e1:    lda  fac_m1
        cmp  #$80
        bne  general
        lda  fac_m2
        ora  fac_m3
        ora  fac_m4
        bne  general
        bit  fac_sign
        bmi  general
        lda  t6a                   ; variable == 0 -> result 1.0 = FAC as it is
        beq  one
        bit  t6f
        bmi  slow                  ; negative variable
        sec
        sbc  #$81
        bcc  slow                  ; 0 < v < 1
        cmp  #31
        bcs  slow                  ; integer part does not fit
        tax
        lda  t6a                   ; FAC = variable
        sta  fac_exp
        lda  t6b
        sta  fac_m1
        lda  t6c
        sta  fac_m2
        lda  t6d
        sta  fac_m3
        lda  t6e
        sta  fac_m4
        lda  #0
        sta  fac_sign
        ldy  bytetab,x             ; add the bit for 1.0
        lda  masktab,x
        clc
@add:   adc  fac_m1,y
        sta  fac_m1,y
        bcc  one
        lda  #0
        dey
        bpl  @add
        lda  fac_m4                ; mantissa overflow (v+1 = 2^n): shift right, exp+1; a 1 shifted out would need rounding
        lsr  a
        bcs  restore
        ror  fac_m1
        ror  fac_m2
        ror  fac_m3
        ror  fac_m4
        lda  fac_m1
        ora  #$80
        sta  fac_m1
        inc  fac_exp
one:    lda  #0
        sta  facov
        rts
restore:
        lda  #$81                  ; put STEP = 1.0 back into FAC for the ROM path
        sta  fac_exp
        lda  #$80
        sta  fac_m1
        lda  #0
        sta  fac_m2
        sta  fac_m3
        sta  fac_m4
        sta  fac_sign
        beq  slowg
slowg:  jmp  slow                  ; (branch distance)
        ; --- STEP: whole number 1..255 (sign in fac_sign) ---
general:
        ldx  fac_exp
        cpx  #$81
        bcc  slowg
        cpx  #$89
        bcs  slowg
        lda  fac_m2
        ora  fac_m3
        ora  fac_m4
        bne  slowg
        lda  fac_m1
        and  fracmask-$81,x
        bne  slowg
        lda  chain_lo-$81,x
        sta  jc+1
        lda  chain_hi-$81,x
        sta  jc+2
        lda  fac_m1
jc:     jmp  chain
chain:  .repeat 7
        lsr  a
        .endrepeat
        sta  s_lo                  ; |STEP| = 1..255
        ; --- variable ---
        lda  t6a
        bne  @v1
        lda  #0                    ; variable = 0: the sum is STEP, which is in FAC already
        sta  facov
        rts
@v1:    bit  t6f
        bmi  slowg                  ; negative variable
        sec
        sbc  #$81                  ; k = number of integer bits - 1 ...
        bcc  slowg                  ; ... 0 < variable < 1
        cmp  #31
        bcs  slowg
        ; 1.0 has mantissa bit p = 31-k (bit 0 = lowest bit of t6e).  STEP << (p & 7): low byte to mantissa byte j = 3-(p>>3)
        ; (0 = most significant), high byte to byte j-1.
        eor  #31
        tax
        and  #7
        tay
        lda  s_lo
        sta  sh_lo
        lda  #0
        sta  sh_hi
        cpy  #0
        beq  @sh2
@sh1:   asl  sh_lo
        rol  sh_hi
        dey
        bne  @sh1
@sh2:   txa
        lsr  a
        lsr  a
        lsr  a
        eor  #3
        tax                        ; X = j
        bne  @j1
        lda  sh_hi                 ; j = 0: the high part would lie above the mantissa
        bne  slowg
@j1:    lda  t6b                   ; work copy of the mantissa
        sta  wm+0
        lda  t6c
        sta  wm+1
        lda  t6d
        sta  wm+2
        lda  t6e
        sta  wm+3
        bit  fac_sign
        bmi  @sub
        ; --- add ---
        clc
        lda  wm,x
        adc  sh_lo
        sta  wm,x
        lda  sh_hi
        dex
        bmi  @atop
@a1:    adc  wm,x
        sta  wm,x
        lda  #0
        dex
        bpl  @a1
@atop:  lda  t6a
        bcc  @store
        ; carry out of the top: shift right, exponent + 1; a 1 shifted out would need rounding -> ROM
        lda  wm+3
        lsr  a
        bcs  @slw
        ror  wm+0                  ; C = 0 here; the top bit is set below
        ror  wm+1
        ror  wm+2
        ror  wm+3
        lda  wm+0
        ora  #$80
        sta  wm+0
        lda  t6a
        clc
        adc  #1
        bcs  @slw
        bcc  @store
@slw:    jmp  slow                  ; (branch distance)
        ; --- subtract (STEP < 0) ---
@sub:   sec
        lda  wm,x
        sbc  sh_lo
        sta  wm,x
        lda  sh_hi
        dex
        bmi  @stop
@s1:    sta  tm2
        lda  wm,x
        sbc  tm2
        sta  wm,x
        lda  #0
        dex
        bpl  @s1
@stop:  bcc  @slw                  ; borrow out of the top: variable < |STEP|
        lda  t6a
        ldx  wm+0
        bmi  @store                ; still normalised
        asl  wm+3                  ; one shift to the left (exact, a 0 comes in), exponent - 1
        rol  wm+2
        rol  wm+1
        rol  wm+0
        bpl  @slw                  ; more than one shift needed (or the result is 0): ROM
        sec
        sbc  #1
@store: sta  fac_exp               ; A = exponent of the result
        lda  wm+0
        sta  fac_m1
        lda  wm+1
        sta  fac_m2
        lda  wm+2
        sta  fac_m3
        lda  wm+3
        sta  fac_m4
        lda  #0
        sta  fac_sign
        sta  facov
        rts
; exponent $81..$88: the low (8-n) bits of fac_m1 must be 0; the chain entry does 8-n shifts
bytetab: .repeat 31, I
        .byte I/8
        .endrepeat
masktab: .repeat 31, I
        .byte $80 >> (I .mod 8)
        .endrepeat
fracmask: .byte $7f,$3f,$1f,$0f,$07,$03,$01,$00
chain_lo: .repeat 8, I
        .byte <(chain + I)
        .endrepeat
chain_hi: .repeat 8, I
        .byte >(chain + I)
        .endrepeat
s_lo:   .byte 0
sh_lo:  .byte 0
sh_hi:  .byte 0
tm2:    .byte 0
wm:     .res 4

; ---- loop variable load/store of NEXT (op13_NEXT_chk float path, next_step_add integer path) ----
stub_next_ld5:  sta  MMU_LCRA
        jmp  next_ld5
stub_next_st5:  sta  MMU_LCRA
        jmp  next_st5
stub_next_ld2:  sta  MMU_LCRA
        jmp  next_ld2
stub_next_st2:  sta  MMU_LCRA
        jmp  next_st2

        .segment "SHARED"
; ld_var X=$0B,Y=4: (varptr),4..0 -> $6E..$6A; exit X=$06, Y=$FF like the trampoline
next_ld5:
        sta  MMU_LCRB
        ldy  #4
        lda  (varptr),y
        sta  $6e
        dey
        lda  (varptr),y
        sta  $6d
        dey
        lda  (varptr),y
        sta  $6c
        dey
        lda  (varptr),y
        sta  $6b
        dey
        lda  (varptr),y
        sta  $6a
        sta  MMU_LCRA
        ldx  #$06
        dey
        rts
; st_var X=4,Y=4: $67..$63 -> (varptr),4..0; exit X=Y=$FF
next_st5:
        sta  MMU_LCRB
        ldy  #4
        lda  fac_m4
        sta  (varptr),y
        dey
        lda  fac_m3
        sta  (varptr),y
        dey
        lda  fac_m2
        sta  (varptr),y
        dey
        lda  fac_m1
        sta  (varptr),y
        dey
        lda  fac_exp
        sta  (varptr),y
        sta  MMU_LCRA
        ldx  #$ff
        dey
        rts
; ld_var X=1,Y=1: (varptr),1 -> $64, (varptr),0 -> $63; exit X=Y=$FF
next_ld2:
        sta  MMU_LCRB
        ldy  #1
        lda  (varptr),y
        sta  fac_m1
        dey
        lda  (varptr),y
        sta  fac_exp
        sta  MMU_LCRA
        ldx  #$ff
        dey
        rts
; st_var X=1,Y=1: $64 -> (varptr),1, $63 -> (varptr),0; exit X=Y=$FF
next_st2:
        sta  MMU_LCRB
        ldy  #1
        lda  fac_m1
        sta  (varptr),y
        dey
        lda  fac_exp
        sta  (varptr),y
        sta  MMU_LCRA
        ldx  #$ff
        dey
        rts
