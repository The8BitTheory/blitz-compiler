; fastpush.s -- prototype P4: narrowing of a whole-number float to a 16-bit integer when it is pushed as left operand.
; push_narrow_try shifts the mantissa bit by bit and tests every shifted-out bit (9-15 cycles per bit, up to 15 bits).
; Here: one mask test for "no fraction bits", then an unrolled shift chain entered at the right place (2 or 7 cycles per bit).
; Same results and exits as the original: push_float (Y = 0 = type byte), push_int_1 (A = low byte, Y = $80), push_int.
; Patch: first 3 bytes of push_narrow_try -> jmp fast_push_narrow_try.
        .setcpu "6502"
        .include "rtsyms.inc"
        .segment "HOOK"
        .export fast_push_narrow_try
tmp = $2a                          ; the original uses $2A as scratch here too
fast_push_narrow_try:
        lda  fac_m3
        ora  fac_m4
        bne  pf
        ldx  fac_exp
        cpx  #$81
        bcc  pf
        cpx  #$89
        bcs  wide
        lda  fac_m2                ; 1..8 integer bits: everything in fac_m1
        bne  pf
        lda  fac_m1
        and  mask8-$81,x
        bne  pf
        lda  chain8_lo-$81,x
        sta  j8+1
        lda  fac_m1
j8:     jmp  chain8
pf:     jmp  push_float
wide:   cpx  #$90
        bcs  pf
        lda  fac_m2                ; 9..15 integer bits
        and  mask16-$89,x
        bne  pf
        lda  fac_m2
        sta  tmp
        lda  chain16_lo-$89,x
        sta  j16+1
        lda  fac_m1
j16:    jmp  chain16
        .align 256
chain8: .repeat 7
        lsr  a
        .endrepeat
        ldx  #0
        stx  fac_m3
        beq  done
chain16: .repeat 7
        lsr  a
        ror  tmp
        .endrepeat
        sta  fac_m3
        lda  tmp
done:   sta  fac_m4
        ldy  #$80
        bit  fac_sign
        bmi  @neg
        jmp  push_int_1
@neg:   jsr  neg_int
        jmp  push_int
; tables indexed by the exponent: number of fraction bits = $89-exp (8 bit) / $90-exp (16 bit)
mask8:  .byte $7f,$3f,$1f,$0f,$07,$03,$01,$00          ; exp $81..$88: low (8-n) bits of fac_m1 must be 0
chain8_lo: .repeat 8, I
        .byte <(chain8 + I)                              ; exp $81 -> 7 shifts ... $88 -> 0
        .endrepeat
mask16: .byte $7f,$3f,$1f,$0f,$07,$03,$01               ; exp $89..$8F: low (16-n) bits of fac_m2 must be 0
chain16_lo: .repeat 7, I
        .byte <(chain16 + 3*I)                           ; exp $89 -> 7 shifts ... $8F -> 1
        .endrepeat
