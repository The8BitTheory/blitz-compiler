0120  a900      LDA #$00
0122  2ca980    BIT $80a9
0125  8d02ff    STA $ff02
0128  8526      STA $26
012a  a02d      LDY #$2d
012c  b12f      LDA ($2f),y
012e  8524      STA $24
0130  c8        INY
0131  b12f      LDA ($2f),y
0133  8525      STA $25
0135  a900      LDA #$00
0137  a017      LDY #$17
0139  912f      STA ($2f),y
013b  c8        INY
013c  912f      STA ($2f),y
013e  a01e      LDY #$1e
0140  912f      STA ($2f),y
0142  c8        INY
0143  912f      STA ($2f),y
0145  a011      LDY #$11
0147  b12f      LDA ($2f),y
0149  18        CLC
014a  6901      ADC #$01
014c  912f      STA ($2f),y
014e  a026      LDY #$26
0150  d12f      CMP ($2f),y
0152  9011      BCC $0165
0154  a900      LDA #$00
0156  a00a      LDY #$0a
0158  912f      STA ($2f),y
015a  a901      LDA #$01
015c  a018      LDY #$18
015e  912f      STA ($2f),y
0160  a01f      LDY #$1f
0162  912f      STA ($2f),y
0164  60        RTS
0165  a8        TAY
0166  b124      LDA ($24),y
0168  2426      BIT $26
016a  3004      BMI $0170
016c  c920      CMP #$20
016e  f0d5      BEQ $0145
0170  a00a      LDY #$0a
0172  912f      STA ($2f),y
0174  c93a      CMP #$3a
0176  f0e8      BEQ $0160
0178  60        RTS
0179  8d02ff    STA $ff02
017c  c8        INY
017d  b161      LDA ($61),y
017f  aa        TAX
0180  88        DEY
0181  b161      LDA ($61),y
0183  8d01ff    STA $ff01
0186  4cd117    JMP $17d1

16b8  a204      LDX #$04
16ba  bd0016    LDA $1600,x
16bd  9524      STA $24,x
16bf  ca        DEX
16c0  10f8      BPL $16ba
16c2  a90e      LDA #$0e
16c4  8d00ff    STA $ff00
16c7  a203      LDX #$03
16c9  20c9ff    JSR $ffc9
16cc  a000      LDY #$00
16ce  8d01ff    STA $ff01
16d1  b124      LDA ($24),y
16d3  a202      LDX #$02
16d5  8e00ff    STX $ff00
16d8  20d2ff    JSR $ffd2
16db  e624      INC $24
16dd  d002      BNE $16e1
16df  e625      INC $25
16e1  a525      LDA $25
16e3  c527      CMP $27
16e5  d0e7      BNE $16ce
16e7  a524      LDA $24
16e9  c526      CMP $26
16eb  d0e1      BNE $16ce
16ed  4cccff    JMP $ffcc
16f0  a900      LDA #$00
16f2  a025      LDY #$25
16f4  a22f      LDX #$2f
16f6  205e02    JSR $025e
16f9  c8        INY
16fa  206102    JSR $0261
16fd  a02d      LDY #$2d
16ff  a92f      LDA #$2f
1701  202c02    JSR $022c
1704  8524      STA $24
1706  c8        INY
1707  202f02    JSR $022f
170a  8525      STA $25
170c  a924      LDA #$24
170e  8d6502    STA $0265
1711  a902      LDA #$02
1713  8d00ff    STA $ff00
1716  a202      LDX #$02
1718  20c6ff    JSR $ffc6
171b  a000      LDY #$00
171d  8490      STY $90
171f  a902      LDA #$02
1721  8d00ff    STA $ff00
1724  20e4ff    JSR $ffe4
1727  206102    JSR $0261
172a  aa        TAX
172b  d008      BNE $1735
172d  c001      CPY #$01
172f  f00f      BEQ $1740
1731  c004      CPY #$04
1733  b003      BCS $1738
1735  c8        INY
1736  d0e7      BNE $171f
1738  98        TYA
1739  a026      LDY #$26
173b  a22f      LDX #$2f
173d  205e02    JSR $025e
1740  a902      LDA #$02
1742  8d00ff    STA $ff00
1745  4cccff    JMP $ffcc
1748  a902      LDA #$02
174a  8d00ff    STA $ff00
174d  a202      LDX #$02
174f  20c6ff    JSR $ffc6
1752  20e4ff    JSR $ffe4
1755  48        PHA
1756  20ccff    JSR $ffcc
1759  68        PLA
175a  a011      LDY #$11
175c  a22f      LDX #$2f
175e  4c5e02    JMP $025e
1761  a011      LDY #$11
1763  a92f      LDA #$2f
1765  202c02    JSR $022c
1768  4900      EOR #$00
176a  48        PHA
176b  a902      LDA #$02
176d  8d00ff    STA $ff00
1770  a203      LDX #$03
1772  20c9ff    JSR $ffc9
1775  68        PLA
1776  20d2ff    JSR $ffd2
1779  4cccff    JMP $ffcc
177c  a9ff      LDA #$ff
177e  a033      LDY #$33
1780  a22f      LDX #$2f
1782  205e02    JSR $025e
1785  c8        INY
1786  a92f      LDA #$2f
1788  202c02    JSR $022c
178b  a8        TAY
178c  a931      LDA #$31
178e  202c02    JSR $022c
1791  18        CLC
1792  6531      ADC $31
1794  8561      STA $61
1796  c8        INY
1797  202f02    JSR $022f
179a  6532      ADC $32
179c  8562      STA $62
179e  a041      LDY #$41
17a0  a92f      LDA #$2f
17a2  202c02    JSR $022c
17a5  8527      STA $27
17a7  c8        INY
17a8  202f02    JSR $022f
17ab  8526      STA $26
17ad  a03a      LDY #$3a
17af  202f02    JSR $022f
17b2  8528      STA $28
17b4  c8        INY
17b5  202f02    JSR $022f
17b8  8529      STA $29
17ba  a000      LDY #$00
17bc  8424      STY $24
17be  8425      STY $25
17c0  a907      LDA #$07
17c2  2ca902    BIT $02a9
17c5  18        CLC
17c6  6561      ADC $61
17c8  8561      STA $61
17ca  9002      BCC $17ce
17cc  e662      INC $62
17ce  4c7901    JMP $0179
17d1  c528      CMP $28
17d3  f013      BEQ $17e8
17d5  e624      INC $24
17d7  d002      BNE $17db
17d9  e625      INC $25
17db  a525      LDA $25
17dd  c527      CMP $27
17df  d0e2      BNE $17c3
17e1  a524      LDA $24
17e3  c526      CMP $26
17e5  d0dc      BNE $17c3
17e7  60        RTS
17e8  e429      CPX $29
17ea  d0e9      BNE $17d5
17ec  a033      LDY #$33
17ee  a22f      LDX #$2f
17f0  a525      LDA $25
17f2  205e02    JSR $025e
17f5  c8        INY
17f6  a524      LDA $24
17f8  4c6102    JMP $0261
