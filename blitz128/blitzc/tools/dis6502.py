#!/usr/bin/env python3
"""Minimal 6502/6510/8502 disassembler (documented opcodes + common illegal ones as .byte)"""
OPS = {}
def _a(mn, modes):
    for m, op in modes.items(): OPS[op] = (mn, m)
_a('ADC',{'imm':0x69,'zp':0x65,'zpx':0x75,'abs':0x6d,'abx':0x7d,'aby':0x79,'izx':0x61,'izy':0x71})
_a('AND',{'imm':0x29,'zp':0x25,'zpx':0x35,'abs':0x2d,'abx':0x3d,'aby':0x39,'izx':0x21,'izy':0x31})
_a('ASL',{'acc':0x0a,'zp':0x06,'zpx':0x16,'abs':0x0e,'abx':0x1e})
_a('BCC',{'rel':0x90});_a('BCS',{'rel':0xb0});_a('BEQ',{'rel':0xf0});_a('BMI',{'rel':0x30})
_a('BNE',{'rel':0xd0});_a('BPL',{'rel':0x10});_a('BVC',{'rel':0x50});_a('BVS',{'rel':0x70})
_a('BIT',{'zp':0x24,'abs':0x2c});_a('BRK',{'imp':0x00})
for n,o in [('CLC',0x18),('CLD',0xd8),('CLI',0x58),('CLV',0xb8),('DEX',0xca),('DEY',0x88),('INX',0xe8),('INY',0xc8),
            ('NOP',0xea),('PHA',0x48),('PHP',0x08),('PLA',0x68),('PLP',0x28),('RTI',0x40),('RTS',0x60),
            ('SEC',0x38),('SED',0xf8),('SEI',0x78),('TAX',0xaa),('TAY',0xa8),('TSX',0xba),('TXA',0x8a),('TXS',0x9a),('TYA',0x98)]:
    _a(n,{'imp':o})
_a('CMP',{'imm':0xc9,'zp':0xc5,'zpx':0xd5,'abs':0xcd,'abx':0xdd,'aby':0xd9,'izx':0xc1,'izy':0xd1})
_a('CPX',{'imm':0xe0,'zp':0xe4,'abs':0xec});_a('CPY',{'imm':0xc0,'zp':0xc4,'abs':0xcc})
_a('DEC',{'zp':0xc6,'zpx':0xd6,'abs':0xce,'abx':0xde})
_a('EOR',{'imm':0x49,'zp':0x45,'zpx':0x55,'abs':0x4d,'abx':0x5d,'aby':0x59,'izx':0x41,'izy':0x51})
_a('INC',{'zp':0xe6,'zpx':0xf6,'abs':0xee,'abx':0xfe})
_a('JMP',{'abs':0x4c,'ind':0x6c});_a('JSR',{'abs':0x20})
_a('LDA',{'imm':0xa9,'zp':0xa5,'zpx':0xb5,'abs':0xad,'abx':0xbd,'aby':0xb9,'izx':0xa1,'izy':0xb1})
_a('LDX',{'imm':0xa2,'zp':0xa6,'zpy':0xb6,'abs':0xae,'aby':0xbe})
_a('LDY',{'imm':0xa0,'zp':0xa4,'zpx':0xb4,'abs':0xac,'abx':0xbc})
_a('LSR',{'acc':0x4a,'zp':0x46,'zpx':0x56,'abs':0x4e,'abx':0x5e})
_a('ORA',{'imm':0x09,'zp':0x05,'zpx':0x15,'abs':0x0d,'abx':0x1d,'aby':0x19,'izx':0x01,'izy':0x11})
_a('ROL',{'acc':0x2a,'zp':0x26,'zpx':0x36,'abs':0x2e,'abx':0x3e})
_a('ROR',{'acc':0x6a,'zp':0x66,'zpx':0x76,'abs':0x6e,'abx':0x7e})
_a('SBC',{'imm':0xe9,'zp':0xe5,'zpx':0xf5,'abs':0xed,'abx':0xfd,'aby':0xf9,'izx':0xe1,'izy':0xf1})
_a('STA',{'zp':0x85,'zpx':0x95,'abs':0x8d,'abx':0x9d,'aby':0x99,'izx':0x81,'izy':0x91})
_a('STX',{'zp':0x86,'zpy':0x96,'abs':0x8e});_a('STY',{'zp':0x84,'zpx':0x94,'abs':0x8c})
SZ={'imp':1,'acc':1,'imm':2,'zp':2,'zpx':2,'zpy':2,'izx':2,'izy':2,'rel':2,'abs':3,'abx':3,'aby':3,'ind':3}
FMT={'imp':'{}','acc':'{} A','imm':'{} #${:02x}','zp':'{} ${:02x}','zpx':'{} ${:02x},x','zpy':'{} ${:02x},y',
     'izx':'{} (${:02x},x)','izy':'{} (${:02x}),y','abs':'{} ${:04x}','abx':'{} ${:04x},x','aby':'{} ${:04x},y','ind':'{} (${:04x})'}
def decode(mem, pc, base=0):
    """mem: bytes-like indexed by address-base. returns (size, mnemonic, mode, operand, text, target)"""
    i = pc-base
    op = mem[i]
    if op not in OPS: return 1,'.byte','bad',op,'.byte ${:02x}'.format(op),None
    mn, m = OPS[op]; n = SZ[m]
    if i+n > len(mem): return 1,'.byte','bad',op,'.byte ${:02x}'.format(op),None
    if n==1: v=None
    elif n==2: v=mem[i+1]
    else: v=mem[i+1]|mem[i+2]<<8
    tgt=None
    if m=='rel':
        t=(pc+2+(v-256 if v>127 else v))&0xffff; txt='{} ${:04x}'.format(mn,t); tgt=t
    else:
        txt=FMT[m].format(mn,v) if v is not None else FMT[m].format(mn)
        if m=='abs': tgt=v
    return n,mn,m,v,txt,tgt
