; fastvar.s -- prototype P1: variable load/store without the $0202 trampolines.
; The top 1 KB ($FC00-$FFFF) is made common RAM (MMU RCR $D506 bit 3). Code there stays visible when the
; MMU switches to configuration B (bank 1), so a variable access needs one inline STA $FF02 / STA $FF01 pair
; instead of three JSR/RTS trampoline calls with two MMU switches each.
; Patches (done by mkimg.py): init `jsr install_trampolines` -> `jsr hook_init`; each redirected runtime entry <label>
; -> `jmp stub_<label>` (bank 0) -> `jmp fast_<label>` (shared page).
; The string heap top ($39/$3A, BASIC MAX MEMORY of bank 1) is lowered from $FF00 to $FC00, so strings never reach
; the shared page.
        .setcpu "6502"
        .include "rtsyms.inc"
        .import __SHARED_LOAD__, __SHARED_RUN__

        .segment "HOOK"
        .export hook_init
hook_init:
        jsr  install_trampolines
        ldx  #0
@cp:    .repeat 3, P
        lda  __SHARED_LOAD__+P*256,x
        sta  __SHARED_RUN__+P*256,x
        .endrepeat
        inx
        bne  @cp
        lda  MMU_CR
        pha
        lda  #$3e                  ; bank 0 RAM + I/O
        sta  MMU_CR
        lda  $d506
        and  #$f4                  ; size bits = 1 KB, clear top flag
        ora  #$0c                  ; bottom + top shared
        sta  $d506
        pla
        sta  MMU_CR
        lda  #$00
        sta  $39
        lda  #$fc
        sta  $3a
        rts


; Entry stubs in bank 0 RAM.  FAST/SLOW and the VIC/SID statements leave the MMU at CR=$02 (KERNAL ROM visible at
; $C000-$FFFF) and rely on the next trampoline call to restore configuration A.  The shared page is hidden then, so every
; redirected runtime entry jumps to a stub that first selects configuration A (STA $FF01 keeps A and the flags).
        .export stub_var_load, stub_var_store, stub_var_load_int, stub_var_load_str, stub_var_load_float
        .export stub_var_store_int, stub_var_store_float
stub_var_load:        sta  MMU_LCRA
        jmp  fast_var_load
stub_var_store:       sta  MMU_LCRA
        jmp  fast_var_store
stub_var_load_int:    sta  MMU_LCRA
        jmp  fast_var_load_int
stub_var_load_str:    sta  MMU_LCRA
        jmp  fast_var_load_str
stub_var_load_float:  sta  MMU_LCRA
        jmp  fast_var_load_float
stub_var_store_int:   sta  MMU_LCRA
        jmp  fast_var_store_int
stub_var_store_float: sta  MMU_LCRA
        jmp  fast_var_store_float

        .segment "SHARED"
        .export fast_var_load, fast_var_store, fast_var_load_int, fast_var_load_str, fast_var_load_float
        .export fast_var_store_int, fast_var_store_float
; Every fast_<label> replaces the runtime entry <label> (mkimg.py patches a JMP there).  The original code behind those
; entries is no longer reached by fall-through, because var_load/var_store themselves are redirected.
; ---- var_load: slot at ($61), value at (varptr) in bank 1 -> FAC / int / string descriptor ----
fast_var_load:
        sta  MMU_LCRB
        ldy  #0
        lda  ($61),y
        bpl  @notint
        sta  intflg
        bmi  ld_int
@notint:
        iny
        lda  ($61),y
        bpl  ld_float
        sta  MMU_LCRA
        jmp  fast_var_load_str
; entered from the array path with A = $80
fast_var_load_int:
        sta  intflg
        sta  MMU_LCRB
ld_int: ldy  #0
        lda  (varptr),y
        sta  fac_m3
        iny
        lda  (varptr),y
        sta  fac_m4
        sta  MMU_LCRA
        ldy  #0
        sty  valtyp
        jmp  next_inc1
; entered with A = $FF (string type), Y = 1
fast_var_load_str:
        sta  valtyp
        sta  MMU_LCRB
        ldy  #2
        lda  (varptr),y
        sta  fac_m2
        dey
        lda  (varptr),y
        sta  fac_m1
        dey
        lda  (varptr),y
        sta  fac_exp
        sta  MMU_LCRA
        lda  varptr
        sta  fac_m3
        lda  varptr_hi
        sta  fac_m4
        lda  #1
        sta  intflg
        jmp  next_inc1_y0
fast_var_load_float:
        sta  MMU_LCRB
ld_float:
        ldy  #4
        lda  (varptr),y
        sta  fac_m4
        dey
        lda  (varptr),y
        sta  fac_m3
        dey
        lda  (varptr),y
        sta  fac_m2
        dey
        lda  (varptr),y
        sta  fac_m1
        dey
        lda  (varptr),y
        sta  fac_exp
        sta  MMU_LCRA
        lda  fac_m1
        sta  fac_sign
        ora  #$80
        sta  fac_m1
        ldy  #0
        sty  intflg
        sty  valtyp
        sty  facov
        jmp  next_inc1

; ---- var_store: FAC / int -> variable (strings go to the original str_store) ----
fast_var_store:
        sta  MMU_LCRB
        ldy  #0
        lda  ($61),y
        bpl  st_notint
        sta  MMU_LCRA
fast_var_store_int:
        lda  intflg
        bmi  @intok
        jsr  fac_to_int
@intok: sta  MMU_LCRB
        ldy  #0
        lda  fac_m3
        sta  (varptr),y
        iny
        lda  fac_m4
        sta  (varptr),y
        sta  MMU_LCRA
        jmp  next
st_notint:
        iny
        lda  ($61),y
        sta  MMU_LCRA
        bpl  fast_var_store_float
        jmp  str_store
fast_var_store_float:
        lda  intflg
        bpl  @f1
        jsr  int_to_fac
@f1:    bit  facov
        bpl  @f2
        jsr  round_fac
@f2:    lda  fac_sign
        ora  #$7f
        and  fac_m1
        sta  fac_m1
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
        jmp  next
