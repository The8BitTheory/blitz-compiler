[English](BLITZ128_ANALYSE.md) · **Deutsch**

# Blitz! 128 (Skyles-Compiler) – Analyse von Compiler und Runtime

Stand: 12.11.2026 · Material: `blitz!.128.prg` (45 212 Bytes, Ladeadresse $1C01) und `blitz-128.d81`
Kennzeichnung: **[gesichert]** = an Daten/Code verifiziert, **[wahrscheinlich]** = aus Code abgeleitet, **[offen]** = nicht geklärt.

Hinweis zum Werkzeug: JC64dis ist eine Java-GUI und lässt sich hier nicht automatisieren. Ich habe deshalb einen eigenen 6502-Disassembler (rekursiv, Code/Daten-Trennung) geschrieben. Er liegt in `analysis/tools/`. Das Listing kannst du bei Bedarf in JC64dis nachvollziehen (Adressen sind identisch zur Ladeadresse).

---

## 1. Kernergebnis in fünf Sätzen

1. **Der Compiler ist selbst ein von Blitz kompiliertes BASIC-Programm.** Er besteht aus der Runtime (ab $1C01) plus seinem eigenen Bytecode, den Strings und einer Variablentabelle am Ende.
2. **Die „Runtime“ ist ein Bytecode-Interpreter** (ca. 11 183 Bytes, $1C01–$46AF). Kompilierte Programme sind keine Maschinensprache, sondern ein XOR-verschleierter Token-/Bytecode-Strom, den dieser Interpreter ausführt.
3. **Eine kompilierte `C/`-Datei ist: kopierte Runtime + 41 gepatchte Schlüsselbytes + Header + Bytecode + Variablennamentabelle.** Die Schlüssel sind für alle Programme identisch (kein Schlüssel pro Programm).
4. Die Datei enthält **zwei Runtime-Varianten**: eine für BASIC-Start $1C01 (Image 1) und eine für $4001 (Image 2, hinten angehängt, ~135 Byte länger).
5. Die D81 enthält **gelöschte Originalquellen und Compiler-Ausgaben** (`C/`, `Z/`, `D/`), die als Rosetta-Stein dienen.

---

## 2. Die D81

| Eintrag | Befund |
|---|---|
| Aktive Datei | `BLITZ!.128` (PRG, 178 Blöcke) – **byte-identisch** mit der .prg im Ordner [gesichert] |
| Gelöschte Dateien | 25 Einträge (Typ $00), Blockketten intakt bis auf `P/LIVE6PERF15-2` (Kette defekt) [gesichert] |
| Quellen (BASIC 7 getokent, Load $1C01) | `LIVE6B`, `LIVE6D`, `LIVE6W2`, `LIVE6W3`, `LIVE8PERF`, `LIVE10WORK`, `-B`, `-E`, `-F`, `-H`, `-I3` |
| Compiler-Ausgabe | `C/…` (kompiliertes Programm, Load $1C01, 18–19 KB), `Z/…` (Adress→Zeilen-Zuordnung, Load $0104), `D/LIVE6` (DATA-Werte, Load $0331) |

Alle extrahierten Dateien: `analysis/d81/`. Entpacker: `analysis/tools/d81x.py`.

**Wichtig für deine Frage:** `C/LIVE6B`, `C/LIVE6`, `C/LIVE6PERF15-0/-1/-2` wurden alle **mit eingebauter Runtime** erzeugt (Option 1/2). Das ist der Referenzfall.

---

## 3. Dateiaufbau von `BLITZ!.128`

```
$1C01-$1C2C  BASIC-Zeile 1: POKE6,PEEK(981):BANK0:SYS PEEK(46)*256+47 : <HOME/ESC-@/CR> "BLITZ!"
$1C2F-$1C5D  Lader (verschiebt das Programm nach $1C00, falls es woanders geladen wurde)
$1C5E-$1CFD  160 Bytes Trampoline (Bank-Umschaltung) – werden zur Laufzeit nach $0202 kopiert
$1D00        "00, OK,00,00" (DOS-Status-Vorlage), $1D04-$1DA0 = $AA-Füllung (161 B, im C/-Output programmspezifisch)
$1DA3-$44xx  Runtime-Code (inkl. kopierter BASIC-FP-Routinen, FOUT etc.)
$4443-$46AF  Dispatch-Tabellen, Konstanten
$46B0-$46B5  Header 1 (6 Bytes, XOR $97)
$46B6-$46C1  Header 2 (XOR $79)
$46C2-...    DATA-Tabelle, danach Bytecode (beim Compiler ab ≈$46F8)
...-$A064    Bytecode + Strings + Variablennamentabelle (Compiler: $9F73–$A064 = 121 Namen)
$A065-$CC9A  Image 2: Runtime-Variante für BASIC-Start $4001 (11 318 Bytes)
```

Der BASIC-Stub zeigt, wie geladen wird: `SYS PEEK(46)*256+47` springt auf `$2E`-Hibyte·256+47. Bei normalem Laden ist das $1C2F. Der Text hinter dem SYS ist ein LIST-Trick: er löscht den Bildschirm und schreibt „BLITZ!“.

Der Lader prüft `$2E`. Ist es nicht `$1C`, kopiert er das Programm seitenweise nach $1C00 und springt auf **$2221** (Haupteinsprung). Image 2 enthält den gleichen Lader, der stattdessen nach $4000 hochkopiert und auf $47B2 springt. [gesichert]

---

## 4. Die Runtime (Interpreter)

### 4.1 Initialisierung ($2221)
- setzt `$2D/$2E` auf $1C01 (VARTAB), kopiert die Trampoline $1C5E… nach `$0202` (Routine `$23CD`) und biegt den Fehlervektor `$0300/$0301` auf diese Routinen um [gesichert].
- `$2288` liest **Header 1** (6 Bytes ab $46B0, je XOR $97) nach `$6A–$6F` [gesichert]:
  `$6A/$6B` = Anfang der Variablennamentabelle, `$6C/$6D` = Ende (= Dateiende), `$6E/$6F` = Größe des Variablenbereichs = **Anzahl Variablen × 7**.
  Geprüft an allen 6 Dateien (z. B. `C/LIVE6B`: 46 Namen, 46×7 = $0142 ✓; Compiler: 121 Namen, 121×7 = $034F ✓).
- Danach läuft `$2288` die Namenstabelle durch (je 2 Byte, XOR $B7) und vergibt jedem Namen einen **7-Byte-Slot** im Variablenbereich ($4B += 7).
- `$233F`/`$2206` lesen **Header 2** (XOR $79): Einsprungadresse, Zeiger auf die DATA-Tabelle (`$43/$44`) und TXTPTR-Start (`$3B/$3C`). [wahrscheinlich]

### 4.2 Speichermodell
- Programm/Bytecode in Bank 0 ab $1C01. Alle Zugriffe auf Variablen, Strings, Arrays laufen über **Trampoline im gemeinsamen RAM** ($0202–$02A1). Sie schreiben `$FF02` (MMU-Preconfig B), lesen/schreiben per `(zp),y` und stellen mit `$FF01` (Preconfig A) zurück. Typische Einsprünge: `$020E`/`$021D` (Variablen holen/speichern), `$022C`/`$022F` (indirektes Lesen, Zeiger in A), `$0238` (Blockkopie), `$024D` (Vergleich), `$025E/$0261`. [gesichert für die Mechanik, **[wahrscheinlich]** dass Preconfig B = Bank 1 ist]
- Zero-Page wie im BASIC-ROM: FAC1 = `$63–$68`, FAC2 = `$6A–$70`, `$10` = Typflag, `$0F` = Integerflag, `$33–$38` = String-/Array-Zeiger. FP-Routinen (z. B. FOUT bei $1DA6, Potenztabelle $4555) sind **Kopien der BASIC-ROM-Arithmetik**, in RAM abgelegt. [gesichert]

### 4.3 Hauptschleife ($27D4–$2800)
Das Bytecode-Byte wird gelesen (`LDA ($3B),y`), mit Schlüssel XOR-t und klassifiziert [gesichert aus dem Code]:

| Byte (nach XOR) | Bedeutung |
|---|---|
| `$00` + Folgebyte `x` | **Erweiterter Opcode** → Tabelle `$45B8`(hi)/`$4665`(lo), x = 0…$44 (69 Einträge) |
| `$01–$0D` | Sonderpfad ab `$2735` (z. B. RETURN = $01, GOSUB = $06) |
| `$0E–$7F` | **Haupt-Opcode** → Tabelle `$4443`(hi)/`$44B5`(lo), 114 Einträge |
| `$80–$BF` | Konstanten/Operanden (`$B0–$BF` = Integerkonstante 0–15, `$A7–$A9` = 1/2/5-Byte-Konstanten) |
| `$C0–$DF` | **Kurzreferenz auf Variable** (Slot-Offset aus Tabelle `$4535`) |
| `$E0–$E5` | Variable mit langem Index (10 Bit, ×7) bzw. Array-/Sonderzugriff |

Der Interpreter ist damit ein **Token-Interpreter mit vorverdrahteten Variablenadressen**, nicht wie BASIC mit Namenssuche. Daher die Geschwindigkeit.

### 4.4 Verschleierung (alles statisch, kein Programmschlüssel)
Die Schlüssel sind **Operanden von `EOR #imm`-Befehlen** im Runtime-Code. In der **Datei** `BLITZ!.128` stehen dort `$00`-Platzhalter, in jedem erzeugten `C/`-File sind sie gepatcht [gesichert, an 5 Dateien identisch].
**Korrektur (VICE-Trace, Nov. 2026):** Der Compiler läuft zur Laufzeit **ebenfalls mit $5A** – bei allen 88 667 getraceten Treffern auf `$2800` gilt `Dateibyte XOR A = $5A`. Die Platzhalter werden also **beim Start im Speicher gepatcht**, und wer das tut, ist offen (in der Datei findet sich kein Code, der die Adressen direkt beschreibt; ein Speicherabzug nach dem Start klärt das). Meine frühere Aussage „im Compiler key $00“ war falsch.

| Adresse(n) | Wert in C/-Datei | Zweck |
|---|---|---|
| `$27A3,$27FF,$2989,…` (≈35 Stellen) | `$5A` | **Bytecode-Strom** wird byteweise mit $5A entschlüsselt |
| `$22CF,$22D6` | `$B7` | Variablennamentabelle |
| `$2257,$323F` | `$EE` | Sonderfälle (Zweck [offen]) |
| `$2A77` | `$3E` | Stringkonstanten-Pfad (passt zum $3E-Schlüssel der Compiler-Strings) [wahrscheinlich] |
| `$2473,$3795,$3F7F` | `$DE` | Operandenbytes (lo) |
| `$247B,$379B,$3F87` | `$E5` | Operandenbytes (hi) |
| `$228F` | `$97` (fest, auch im Compiler) | Header 1 |
| `$2216,$221C,$2233,$223A,$2342,$2349` | `$79` (fest) | Header 2 |

Zusätzlich gibt es einen **Selbstentschlüsselungs-Haken** `$1E2A` (XOR mit Tabelle `$45FC`, wird mit `JSR` vor 104 Byte Code aufgerufen). [wahrscheinlich, Wirkung nicht nachgestellt]

**Zweite Schicht für Sprungziele** (aus Rosetta-Vergleich, siehe 6): Nach der $5A-Entschlüsselung ist ein 16-Bit-Ziel `(b0 XOR $7D, b1 XOR $0E)` = absolute Adresse im Programm. Geprüft gegen die `Z/`-Tabelle für `GOSUB 200/2000/5000/10000/11000/30000/40000` – stimmt in allen Fällen (GOSUB auf eine nicht vorhandene Zeile landet auf der nächsten vorhandenen, z. B. 40000 → 40002).

### 4.5 Opcode-Tabellen
Vollständige Liste aller 114 + 69 Handler mit Länge, Kernal-Aufrufen und Unterroutinen: **`analysis/handler_summary.txt`**. Zuordnungen, die aus den Kernal-Aufrufen folgen [wahrscheinlich]:

- Haupt-Opcodes `$3B–$45`: **PRINT-Familie** (CHROUT/CLRCHN; `$42/$44` mit CHKOUT = PRINT#)
- `$46` und erw. `$00`: **GET** (GETIN)
- `$48`: CHKIN (INPUT#/GET#), `$51/$53/$55/$57`: **INPUT**-Varianten (CHRIN)
- `$60`: **OPEN**, `$61`: **CLOSE**
- `$1E`: **RESTORE** (durchläuft die DATA-Tabelle), `$01`: **RETURN**, `$06`: **GOSUB**, `$4E`: **GOTO/THEN-Zeile**
- Viele Opcodes teilen Handler (`$2E95` für `$23–$2D,$6C,$6F` = „in diesem Kontext unzulässig“; `$2F85` für `$2F,$31,$32,$70`).

Konstantenkodierung für Einzelzeichen-Strings: `Zeichen XOR $11` (nach $5A-Schicht), z. B. "1"→`$20`, "Q"→`$40`, "_"→`$4E`. [gesichert an den IF-I$=… Zeilen von LIVE6B]

---

## 5. Der Compiler

### 5.1 Aufbau [gesichert]
Runtime (Schlüssel zur Laufzeit $5A, siehe 4.4) + eigener Bytecode + Stringpool + 121 Variablen. Die Strings sind mit **$3E** verschleiert (`analysis/strings_compiler_xor3e.txt`, 234 Fundstellen).

### 5.2 Bedienung/Funktionsumfang (aus den Strings)
Das Menü ist **viersprachig (EN/FR/IT/DE)** und kennt fünf Betriebsarten:

1. Einzelnes Programm → Diskette **mit Runtime-Routinen**
2. **Alle** Programme einer Diskette → leere Diskette, **jeweils** mit Runtime
3. Alle Programme → leere Diskette, **nur das erste Modul** enthält die Runtime
4. Alle Programme → leere Diskette (mit Overlay)
5. Einzelnes Programm → Diskette **ohne Runtime-Routinen**

Dazu: Quell-/Ziel-Laufwerk (Gerätenr. 8/9…), Programmnamen, optionales **Formatieren** der Zieldiskette, Abfrage `COMPILE…`.

### 5.3 Arbeitsweise [wahrscheinlich]
- Meldungen **PASS0 / PASS1 / PASS2** → mindestens drei Läufe über das Quellprogramm.
- Fehlermeldungen des Compilers: *DO WITHOUT LOOP*, *LOOP WITHOUT DO*, *BEND NOT FOUND*, *SYNTAX ERROR*, *UNDEF'D STATEMENT*, *BAD SUBSCRIPT*, *OVERFLOW*, *TYPE MISMATCH*, *ILLEGAL COMMAND* (auch DE/FR/IT).
- Ausgabe in vier Dateien pro Programm: `C/NAME` (Objekt), `Z/NAME` (Zeilentabelle), `D/NAME` (DATA), `P/NAME` (Zusatzdatei, nur Name und eine defekte Kette belegt → Zweck [offen]).
- Ausgabe von `C/`: der Compiler schreibt **seine eigene Runtime** ($1C01–$46AF aus dem Speicher) und patcht die 41 Schlüsselstellen. Header 1/2, Bytecode und die Namenstabelle folgen.

### 5.4 Compilerdirektiven im Quelltext
In den Quellen kommen `REM ** NG`, `REM ** FI I,BI,CI,R,P,…`. Im Compiler-Stringpool stehen die Direktiven **`**NE`, `**NG`, `**RI`, `**FI`, `**SP`** und `EXTENSIONS`.
- `FI var,var,…` = Liste von Variablen, die als **Integer („Fast Integer“)** behandelt werden [durch das Handbuch bestätigt; im Overlay-Modus gilt das Flag für alle Module, siehe Abschnitt 13]
- `NG` = kein Grafik-Array: die 9 KB Hi-Res-Bereich nicht reservieren bzw. nicht nach `$4000` verschieben, wenn ein GRAPHIC-Befehl vorkommt (für GRAPHIC 5 oder extrem lange Programme); `RI` = Eingabepuffer `$0200-$0240` wiederherstellen (nach EXTENSION oder SYS-Routinen); `NE` = keine Extension-Liste (unterdrückt die `?EXTENSION`-Meldungen) [alle durch das Handbuch bestätigt, `runtime/MANUAL.md`]
- `SP`: im Handbuch nicht dokumentiert (die Tests benutzen `rem **sp31415`), Bedeutung [offen]
- `::` vor einem Befehl = EXTENSION: wird nicht kompiliert, sondern zur Laufzeit an den BASIC-Interpreter gereicht [Handbuch]

---

## 6. Zuordnung Quelltext ↔ Bytecode (Rosetta-Stein)

Datei `analysis/bytecode_C_LIVE6B.txt` (420 Zeilen) zeigt je BASIC-Zeile den $5A-entschlüsselten Bytecode. Verifizierte Fragmente:

| BASIC | Bytecode (nach $5A) | Befund |
|---|---|---|
| `RETURN` | `01` | gesichert |
| `GOSUB 200` | `06 3A 4D` | `06` + 16-Bit-Ziel `(3A^7D, 4D^0E)` = `$4743` ✓ |
| `IF I$="1" THEN 11500` | `9B F5 20 1E 4E 30 8B` | `F5`=I$, `20`="1", `1E`=Stringvergleich „=“, `4E`=GOTO-Ziel `(30^7D,8B^0E)` |
| `IF I$="Q" THEN END` | `9B F5 40 1E 03 1F 53` | `03`=END(?) + Sprungwort |
| `GC(0)=6:GC(1)=0:…` | `AC AA F8 1B, AD AC F8 1B, …` | Array-Zuweisung, Index/Wert als Kurzkonstanten |
| `IF…THEN …:IF…THEN` (Zeile 200) | `… 05 3A 65` | `05`+Wort = bedingter Sprung ans Zeilenende |
| `ON CS GOTO …` | `95 07 0A 3A 8D 3A 97 …` | Liste von Sprungwörtern |

Daraus folgt: Der Compiler **löst Zeilennummern in absolute Adressen auf** und lässt REM-Zeilen weg; die `Z/`-Datei hält die Rückzuordnung Adresse → Originalzeile fest.

---

## 7. Image 2 (Runtime für $4001)
Struktur wie Image 1 (gleicher Lader mit Hochkopieren um $24 Seiten, Fill-Bereich bei $4104, Marker `0F DA A1 00`), aber **nicht** bloß relokiert: ab $41A3 sind ≈401 Byte zusätzlicher Code eingefügt (alle späteren internen Adressen +$2591 statt +$2400), Gesamtlänge 11 318 B. Der eingeschobene Code arbeitet mit anderen Variablen ($1131/$1155…) und ruft viele Hilfsroutinen auf. [gesichert als Variante, **Zweck [wahrscheinlich]**: Runtime für Programme, die den Grafikbereich belegen und deshalb bei $4001 beginnen]. Im Compiler-Image 1 wird sie nicht ausgeführt.

---

## 7b. Ergebnisse des VICE-Laufs (13.11.2026)
Aufbau: GTK3VICE 3.7 (x128), `work8.d81` (BLITZ!.128 + `CRAWL` = `crawl.prg` aus dem Repo `dungeoncrawlerjam2025`) in Laufwerk 8, `work9.d81` (leer) in Laufwerk 9. Tracepoint `trace exec 2800` mit `m 3b 3c` (Log in `crawl/trace.log`, 18 MB).

- **Die Hauptschleife der Runtime ist wie beschrieben** (`$27FC: LDA ($3B),Y / EOR #key / BEQ $279F`; `$3B/$3C` = Bytecode-Zeiger). Alle 88 667 Treffer: `Datei[ptr] XOR A = $5A`. [gesichert]
- **Operandlängen** (Abstand zum nächsten Opcode), aus dem Trace, ausführlich in `opcode_stats_trace.txt` [gesichert für die genannten Opcodes]:
  - `$B0–$BF`: 1 Byte (Integerkonstante 0–15)
  - `$A0, $A4, $A6`: Opcode + 1 Byte; `$A7`: + 2 Byte (16-Bit-Konstante); `$A8`: + 5 Byte (Gleitkommakonstante)
  - `$E0–$E5`: Opcode + 1 Byte (Variable mit langem Index)
  - **`$E8–$EE`: Stringkonstante, die Länge = Opcode − $E8, danach die Zeichen**; `$E7` + Längenbyte für längere Strings
  - `$01–$0E, $81–$8F, $F0–$FF` u. a.: 1 Byte (Operatoren/Statements ohne Operand)
  - Sprung-/Kontroll-Opcodes (`$13, $19, $1A, $1B, $1D, $1F, $52, $58`) zeigen gemischte Abstände, weil sie verzweigen
- **`P/NAME` ist eine Zwischendatei zwischen den Durchläufen** (SEQ-Datei, wird beim Compile zuerst geschrieben und offen gehalten, erste Ablage im Compile von CRAWL: `P/CRAWL`). [gesichert für das Auftreten, Inhalt noch nicht ausgewertet]

## 8. Was offen ist
1. **Kompletter Bytecode-Decompiler**: Operandformate der ~180 Opcodes sind nur in Fragmenten bekannt. Der Weg dorthin: aus `handler_summary.txt` je Handler die Operandlänge ableiten (Tail `LDA #n / JMP $27E9`) und mit weiteren Rosetta-Zeilen abgleichen. Dann lässt sich auch der **Compiler-Bytecode selbst** zurück in BASIC übersetzen.
2. Der Bereich ab ≈$46F8 im Compiler sieht (Wiederholungsmuster) nach DATA-Tabellen aus, nicht nach Code. **Wo der Compiler-Code beginnt, ist noch offen.**
3. Inhalt von `P/…` (Zwischendatei), Direktive `SP` (die übrigen stehen im Handbuch, siehe 5.4), Bedeutung der Opcodes `$01–$0D` (gelöst, siehe `runtime/`).
4. **Overlay-/Chain-Modus** (Menüpunkte 3/4): wie nachfolgende Module ohne Runtime auf die des ersten zugreifen, ist nicht untersucht (die vorhandenen `C/`-Beispiele enthalten alle die Runtime).
5. Dynamische Prüfung fehlt: ein Lauf in VICE (`x128`) mit Monitor-Trace von `$27FC` würde jede Annahme in Abschnitt 4.3 sofort bestätigen und die offenen Opcodes schnell schließen.

## 9. Dateien
| Pfad (`blitz128/analysis/`) | Inhalt |
|---|---|
| `runtime_1c01.asm` | Rekursives Listing der Runtime $1C2F–$46AF (5 693 Zeilen) |
| `handler_summary.txt` | Alle Opcode-Handler mit Länge/Kernal/Unterroutinen |
| `strings_compiler_xor3e.txt` | Menü-/Fehlertexte des Compilers (4 Sprachen) |
| `bytecode_C_LIVE6B.txt` | Zeile für Zeile Quelltext ↔ entschlüsselter Bytecode |
| `d81/` | alle (auch gelöschte) Dateien der D81 |
| `tools/` | `dis6502.py`, `rtdis.py`, `mklist.py`, `handlers.py`, `bas7.py`, `zmap.py`, `d81x.py`, `bcdump.py` |

## 10. Nachtrag: Ergebnisse des CRAWL-Compile-Laufs (mem.bin, C_CRAWL)

- **Image 2 = Runtime-Template für $4001-Ausgaben.** Die ersten 11318 Bytes ($4001-$6C36) von `C_CRAWL.prg` sind byte-identisch mit "Image 2" im Compiler (0 Differenzen). Der Compiler schreibt dieses Template unverändert und hängt Header + XOR-Bytecode + Variablentabelle an. Image 1 (Load $1C01, 41 Patchstellen) wird dagegen für $1C01-Ausgaben verwendet.
- **mem.bin vs. Datei (nach vollständigem Compile):** nur 53 Bytes unterschiedlich: DOS-Statustext $1D00-$1D0C plus die 41 Schlüssel-Patchstellen (Platzhalter $00 in der Datei -> $5A/$B7/$EE/$DE/$E5/$3E im Speicher). Es gibt also keine Code-Entschlüsselung; die Schlüssel werden beim Start in den Speicher gepatcht.
- **Trace $27FC:** Schlüssel für Bytecode ist durchgehend $5A (alle 88.667 Treffer).
- **P_CRAWL** ist die Zwischendatei zwischen den Pässen; C_/Z_/D_CRAWL sind Objekt, Adress-Zeilen-Map und DATA-Werte.
- **Offen:** Direkt hinter dem Template ($6C37) stehen `00 00 00 ff ff ff ff 00 00 00 28 03 1a 02 46 95 ...`; das passt nicht zum Header1-Schema (^$97). Position von Header1/Header2/Variablennamentabelle im $4001-Format ist noch nicht gesichert. Ebenso offen: wer die 41 Patches beim Start schreibt (Startup-Trace ab Programmstart nötig), und die Operandlängen der Sprungopcodes $13,$19,$1A,$1B,$1D,$1F,$52,$58.

## 11. Wer patcht die 41 Schlüsselstellen? (VICE-Lauf 15.11.2026) [gesichert]

**Antwort: die Runtime selbst, mit selbstentschlüsselndem Code.** Das Listing in `runtime_1c01.asm` ab `$23CF` ist in der Datei *verschlüsselt* (es sieht nur zufällig plausibel aus). Der Aufruf `JSR $1E2A` bei `$23CD` entschlüsselt die 104 ($68) Bytes ab `$23D0` an Ort und Stelle (`EOR $45FC,y`) und kehrt in den entschlüsselten Code zurück. Am Ende springt der Code mit gepushter Rücksprungadresse nach `$1E35` und verschlüsselt sich damit wieder. Deshalb zeigt `mem.bin` an dieser Stelle dieselben Bytes wie die Datei.

Entschlüsselter Patcher (`$23D0`):
```
LDX #0 : LDA #$2F
L: EOR $46BC,X : STA $6A,X : INX : CPX #6 : BNE L   ; laufende XOR-Kette
STA $2257,$323F                 ; $6F  = $EE
LDA $6B : STA $2A77             ; $6B  = $3E
LDA $6C : STA $22CF,$22D6       ; $6C  = $B7
Zeiger $24/$25 = $27A0, Y=3, bis Hi-Byte = $40:
   LDA $6A : STA ($24),Y        ; $6A  = $5A
   scan: naechste Stelle, an der (ptr+0..2) == B1 3B 49 (= LDA ($3B),Y ; EOR #imm) ist
LDA $6D : STA $2473,$3795,$3F7F ; $6D  = $DE
LDA $6E : STA $247B,$379B,$3F87 ; $6E  = $E5
```
- **Schlüssel = XOR-Kette über 6 Bytes ab `$46BC`** mit Startwert `$2F`: `75 64 89 69 3B 0B` ergibt `$6A..$6F = 5A 3E B7 DE E5 EE`. Das sind genau die beobachteten Werte. Die Schlüssel stehen also verdeckt im Header 2 (Bytes `$46BC–$46C1`, bei `$4001`-Programmen `$6C4D–$6C52`). **Korrektur:** Sie sind **pro Compile zufällig**. Drei Compiles von CRAWL ergeben drei verschiedene Sätze, und `C_LIVE6B` läuft mit Bytecode-Schlüssel `$46` (in VICE bestätigt). Die `$5A`-Werte an den Patchstellen der `C/`-Dateien sind nur Überbleibsel aus dem Speicher des Compilers, weil dieser seine eigene, schon gepatchte Runtime abspeichert. Die Rosetta-Auswertung in Abschnitt 6 (`$5A` auf LIVE6B) ist daher mit dem falschen Schlüssel gemacht und muss mit `$46` wiederholt werden.
- Die `$5A`-Stellen sind **alle** `EOR #imm`-Operanden direkt hinter `LDA ($3B),Y` (Signatur `B1 3B 49`) im Bereich `$27A0–$3FFF`, dazu `$27A3` direkt. Das sind 29 Stellen. Die vier Treffer `$3795/$379B/$3F7F/$3F87` werden danach mit `$DE`/`$E5` überschrieben.
- Warum die Trace-Haltepunkte bisher nichts zeigten: erster Treffer auf `$27FF` war der Kernal-LOAD (`$02B8`, A=`$00`). Der echte Patch kommt bei `$23FF` (`STA ($24),Y`, A=`$5A`), und zwar im entschlüsselten Code, den ein statisches Listing der Datei nicht zeigt.
- **Doppelnutzung:** Der Patcher verschlüsselt sich am Ende wieder (`JMP $1E35`). Die verschlüsselten Bytes `$23D0–$2437` sind zugleich gültige Opcode-Handler (Sprungziele `$23E6`, `$23F4`, `$23FA`, `$240F`, `$2415` …). Das alte Listing ist dort also für die Laufzeit **richtig**. Den Patcher habe ich separat abgelegt (`patcher_1c01.bin`, `patcher_4001.bin`), das Laufzeit-Abbild steht in `run_1c01.bin`/`run_4001.bin` (Werkzeug `tools/runimg.py`), das Listing in `runtime_1c01_run.asm`.
- (überholt:) `runtime_1c01.asm` ist im Bereich `$23D0–$2437` Datenmüll. Der Bereich muss mit `EOR $45FC,y` entschlüsselt werden. Außerdem sollte man prüfen, ob `JSR $1E2A` noch an anderen Stellen (insbesondere im Compiler-Teil und in Image 2) weiteren Code verschlüsselt.

Aufbau zum Nachstellen: VICE 3.9 aus dem Quellcode, `--enable-headlessui`, `x128 -warp -sounddev dummy -drive8type 1581 -8 d.d81 -moncommands t.mon -limitcycles 40000000 -keybuf 'load"blitz!.128",8\nrun\n'`, Monitor `trace store 27ff`.

---

## 12. Fehler: Image 2 ist 10 Bytes zu kurz (gefunden 17.11.2026)
Die an `BLITZ!.128` angehängte `$4001`-Runtime endet bei `$6C36`, braucht aber Daten bis `$6C40`. Der Compiler kopiert die vollen
11 328 Bytes, die letzten 10 Bytes jeder `$4001`-Ausgabe stammen daher aus dem RAM hinter dem Compiler (in VICE `00 00 00 FF FF FF FF 00 00 00`).
Es sind die letzten vier Einträge (`$41-$44`) der Low-Byte-Tabelle der erweiterten Opcodes (CIRCLE, PAINT, BOX, `$44`) und die Konstante PI.
Folge: CIRCLE/PAINT/BOX rufen nicht initialisiertes RAM bei `$0142` auf, `π` ist Müll. Korrektur: `blitz128/fixed/` (siehe `fixed/README.md`),
angehängt werden `38 03 91 71 82 C9 0F DA A1 00`. Analyse im Detail: `runtime/IMAGE2.md`. Herkunft: die Datei ist eine gecrackte Version; ob die ungecrackte Skyles-Distribution dieselbe Kürzung hat, ist unbekannt.

---

## 13. Overlay-/Chain-Modus (gelöst 17.11.2026, siehe `runtime/OVERLAY.md`)
Menüpunkt 4 („... mit Overlay-Funktion“) fügt PASS0 hinzu; dadurch bekommt jedes Modul dieselbe Variablennamen-Tabelle (Vereinigung über alle Programme).
Zur Laufzeit lädt `LOAD "next",8` das nächste Modul und startet die Runtime neu; `init_vars` läuft im Prüfmodus und behält die Variablen, wenn die Tabelle des neuen Moduls
passt und die Namen Slot für Slot übereinstimmen, sonst wird alles gelöscht. `RUN "next"` löscht immer. Mit Original-Compiler und -Runtime in VICE bestätigt
(A: `a=42:b$="hello":c=7`; B liest sie: Modus 3 mit anderer Variablenreihenfolge verliert sie, Modus 4 behält sie). Offener Punkt 4 aus Abschnitt 8 ist damit geklärt.

---

## 14. Das Handbuch (Skyles, 1985; Notizen in `runtime/MANUAL.md`)
Das gescannte Handbuch wurde am 17.11.2026 gelesen. Es dokumentiert die Direktiven (5.4), den Extension-Mechanismus (`::`), die fünf Unteroptionen des Kompilierens, die Grenzen
(255 Byte Zeilenlänge, 5000 Zeilen, 6000 Sprünge, 1000 Variablen, 255 Arrays, 200 `**FI`-Variablen), das Spezial-Array `z*%` und die Maschinensprache-Regeln (`$3D/$3E` nach SYS wiederherstellen).
Es bestätigt die Overlay-Befunde aus Abschnitt 13 (Option 4 = Extra-Durchlauf, der die Variablen liest; Startprogramm wird auf das längste Modul verlängert) und sagt, dass Option 3
keine Variablen übergibt. Der geforderte Dongle fehlt hier: diese Kopie ist eine gecrackte Version (Angabe des Repository-Eigentümers). Es erwähnt nicht den BAD-SUBSCRIPT-Fehler bei Array-Zuweisungen mit konstantem Index und Wert (`runtime/OVERLAY.md`).

---

## 15. Zwei Runtime-Befunde (VICE-Traces, 17.11.2026)
* **`::` EXTENSION = Opcode `$47`.** Der Compiler legt den getokenten BASIC-Text des Befehls unverschlüsselt und bis zum schließenden `:` hinter dem Opcode ab. Die Runtime setzt IGONE auf `tr_user_ret`,
  lässt das BASIC-ROM ein Statement ausführen und macht am BASIC-Textzeiger `$3D/$3E` weiter (`jump_3d3e`). Siehe `runtime/names.py` (`OP_COMMENT[0x47]`) und `runtime/MANUAL.md`.
* **Arrays scheitern in Programmen ohne skalare Variable** (Fehler 18 BAD SUBSCRIPT beim ersten Array-Zugriff). `init` ruft `init_vars` im Prüfmodus auf; bei leerer Variablentabelle ist `vbase + 0 == strend`, die Prüfung besteht und
  `init` überspringt `op15_CLR`, die Array-Zeigertabelle (`z*%`) wird also nie initialisiert. Workaround: eine skalare Variable deklarieren. Details und Trace: `runtime/OVERLAY.md`.
