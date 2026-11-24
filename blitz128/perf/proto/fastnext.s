; fastnext.s -- prototype P3: NEXT with a floating-point loop variable and STEP 1 (the normal FOR I=A TO B loop).
; op13_NEXT_chk adds STEP (FAC, from the FOR stack) to the variable (ARG = t6a exp, t6b..t6e mantissa, sign in t6f)
; with the ROM routine FADD ($8848, ~360 cycles) and rounds with ROM $8C47.  For STEP = +1.0 and a variable >= 1 whose
; integer part fits the 32-bit mantissa, adding 1 is adding one bit at position (exp-$81) of the mantissa: no shifts,
; exact, so the result is bit-identical to FADD (rounding byte 0).  Everything else takes the original ROM path.
; Patch (mkimg.py): $3637 `lda #$48 ... jsr rom_call_x : jsr round_fac` (15 bytes) -> `jsr fast_next_add : jmp $3646`.
        .setcpu "6502"
        .include "rtsyms.inc"
        .segment "HOOK"
        .export fast_next_add
fast_next_add:
        lda  fac_exp               ; STEP == +1.0 ?
        cmp  #$81
        bne  slow
        lda  fac_m1
        cmp  #$80
        bne  slow
        lda  fac_m2
        ora  fac_m3
        ora  fac_m4
        bne  slow
        bit  fac_sign
        bmi  slow
        lda  t6a                   ; variable == 0 -> result 1.0 = FAC as it is
        beq  one
        bit  t6f
        bmi  slow                  ; negative variable: leave it to the ROM
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
slow:   lda  #$48                  ; original code
        sta  rom_call_lo
        ldx  #$88
        lda  fac_exp
        jsr  rom_call_x
        jmp  round_fac
bytetab: .repeat 31, I
        .byte I/8
        .endrepeat
masktab: .repeat 31, I
        .byte $80 >> (I .mod 8)
        .endrepeat
