import { describe, expect, it } from 'vitest'
import { parseBulk, parseCsv, detectDelimiter, rowToItem } from '../src/data/bulk'
import { Catalog } from '../src/data/catalog'
import { SEED_DOCS } from '../src/data/seed'

const cat = new Catalog(SEED_DOCS)

describe('Bulk-Import', () => {
  it('erkennt Trennzeichen', () => {
    expect(detectDelimiter('Name;Menge')).toBe(';')
    expect(detectDelimiter('Name\tMenge')).toBe('\t')
    expect(detectDelimiter('Name,Menge')).toBe(',')
    expect(detectDelimiter('M3 Schrauben ~200')).toBe('')
  })
  it('CSV mit Anführungszeichen', () => {
    expect(parseCsv('a;"b;c";"d ""x"""\n1;2;3', ';')).toEqual([['a', 'b;c', 'd "x"'], ['1', '2', '3']])
  })
  it('Kopfzeile, Ort und Kategorie werden aufgelöst', () => {
    const { rows, header } = parseBulk('Name;Menge;Ort;Kategorie;Tags\nSchrumpfschlauch rot;~20;R2-K6;Kabel;löten, #rot\nRätselteil;3;Nirgendwo;;', cat)
    expect(header).toBe(true)
    expect(rows[0]).toMatchObject({ name: 'Schrumpfschlauch rot', quantity: 20, approx: true, placeId: 'p-r2-k6', categoryId: 'c-kabel', tags: ['löten', 'rot'] })
    expect(rows[1].placeId).toBeNull()
    expect(rows[1].warnings[0]).toMatch(/Ort/)
    expect(rowToItem(rows[0])).toMatchObject({ name: 'Schrumpfschlauch rot', place_id: 'p-r2-k6', quantity_approx: true })
  })
  it('einspaltige Liste nutzt die Schnell-Syntax', () => {
    const { rows } = parseBulk('2x LiPo 3S\nKabelbinder ~100\nBit-Set 3 Stück', cat)
    expect(rows.map((r) => [r.name, r.quantity])).toEqual([['LiPo 3S', 2], ['Kabelbinder', 100], ['Bit-Set', 3]])
  })
  it('Zeile ohne Namen ist ein Fehler', () => {
    const { rows } = parseBulk('Name;Menge\n;4', cat)
    expect(rows[0].error).toBe('Name fehlt')
  })
})
