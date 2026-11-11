import { describe, expect, it } from 'vitest'
import { formatQuantity, parseLine, parseQuickAdd } from '../src/data/parser'

describe('Schnell-Hinzufügen Parser', () => {
  it('2x Name', () => expect(parseLine('2x LiPo 3S')).toMatchObject({ name: 'LiPo 3S', quantity: 2, unit: 'Stück' }))
  it('2 x mit Großbuchstabe und ×', () => {
    expect(parseLine('3 X Kabelbinder')).toMatchObject({ name: 'Kabelbinder', quantity: 3 })
    expect(parseLine('4× Muttern')).toMatchObject({ name: 'Muttern', quantity: 4 })
  })
  it('Name ~200', () => expect(parseLine('M3 Schrauben ~200')).toMatchObject({ name: 'M3 Schrauben', quantity: 200, approx: true }))
  it('Name ~ 30 mit Leerzeichen', () => expect(parseLine('Heißkleber ~ 30')).toMatchObject({ quantity: 30, approx: true }))
  it('Name 5 Stück', () => expect(parseLine('Arduino Nano 5 Stück')).toMatchObject({ name: 'Arduino Nano', quantity: 5, unit: 'Stück' }))
  it('Einheiten und Dezimalkomma', () => expect(parseLine('PLA schwarz 0,7 kg')).toMatchObject({ name: 'PLA schwarz', quantity: 0.7, unit: 'kg' }))
  it('Zahl im Namen bleibt Name', () => {
    expect(parseLine('LiPo 3S 2200 mAh 25C')).toMatchObject({ name: 'LiPo 3S 2200 mAh 25C', quantity: 1 })
    expect(parseLine('Heißkleber')).toMatchObject({ name: 'Heißkleber', quantity: 1, approx: false })
  })
  it('Liste mit Komma, Semikolon, Zeilenumbruch', () => {
    const l = parseQuickAdd('M3 Schrauben ~200, 2x LiPo 3S;Heißkleber\n\n  ')
    expect(l.map((x) => x.name)).toEqual(['M3 Schrauben', 'LiPo 3S', 'Heißkleber'])
    expect(l.map((x) => x.quantity)).toEqual([200, 2, 1])
  })
  it('Anzeige', () => {
    expect(formatQuantity(200, null, true)).toBe('~200')
    expect(formatQuantity(0.7, 'kg')).toBe('0,7 kg')
    expect(formatQuantity(null)).toBe('–')
  })
})
