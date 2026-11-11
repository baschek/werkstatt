// Bulk-Import: CSV oder eingefügte Tabelle (Excel/Sheets: Tabulator) → Vorschau → Dinge.
import type { Catalog } from './catalog'
import { parseLine, parseNumber } from './parser'
import { fold, resolveCategory, resolvePlace } from './search'
import type { ItemData } from './types'

export interface BulkRow {
  line: number
  name: string
  quantity: number | null
  unit: string | null
  approx: boolean
  placeRef: string
  placeId: string | null
  categoryRef: string
  categoryId: string | null
  tags: string[]
  notes: string
  warnings: string[]
  error: string | null
}

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  if (first.includes('\t')) return '\t'
  const semi = (first.match(/;/g) ?? []).length
  const comma = (first.match(/,/g) ?? []).length
  if (semi && semi >= comma) return ';'
  // Komma nur als Trenner, wenn es wie eine Tabelle aussieht (Kopfzeile oder mehrere Spalten)
  return comma >= 2 || /^(name|bezeichnung|ding)/i.test(first) ? ',' : ''
}

export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c
    } else if (c === '"' && cell === '') q = true
    else if (delim && c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows.map((r) => r.map((x) => x.trim()))
}

const HEADERS: Record<string, string> = {
  name: 'name', bezeichnung: 'name', ding: 'name', artikel: 'name', titel: 'name',
  menge: 'quantity', anzahl: 'quantity', stueck: 'quantity',
  einheit: 'unit',
  ort: 'place', kiste: 'place', platz: 'place', lagerort: 'place', box: 'place',
  kategorie: 'category', gruppe: 'category',
  tags: 'tags', schlagworte: 'tags', tag: 'tags',
  notiz: 'notes', notizen: 'notes', bemerkung: 'notes', kommentar: 'notes',
}

export function parseBulk(text: string, cat: Catalog): { rows: BulkRow[]; header: boolean; delimiter: string } {
  const delimiter = detectDelimiter(text)
  const grid = parseCsv(text, delimiter)
  if (!grid.length) return { rows: [], header: false, delimiter }
  const firstMapped = grid[0].map((h) => HEADERS[fold(h).replace(/[^a-z]/g, '')])
  const header = firstMapped.some(Boolean) && firstMapped.includes('name')
  const cols: (string | undefined)[] = header ? firstMapped : ['name', 'quantity', 'place', 'category', 'tags', 'notes']
  const body = header ? grid.slice(1) : grid
  const rows: BulkRow[] = body.map((cells, idx) => {
    const get = (k: string) => (cells[cols.indexOf(k)] ?? '').trim()
    const warnings: string[] = []
    let name = get('name')
    let quantity: number | null = null
    let unit: string | null = get('unit') || null
    let approx = false
    const qraw = get('quantity')
    if (!delimiter && !header) { // einspaltig: Schnell-Syntax
      const p = parseLine(name)
      name = p.name; quantity = p.quantity; unit = p.unit; approx = p.approx
    } else if (qraw) {
      const m = qraw.match(/^(~?)\s*(\d+(?:[.,]\d+)?)\s*(.*)$/)
      if (m) { quantity = parseNumber(m[2]); approx = m[1] === '~'; if (m[3] && !unit) unit = m[3] } else warnings.push(`Menge „${qraw}“ nicht verstanden`)
    } else quantity = 1
    const placeRef = get('place')
    let placeId: string | null = null
    if (placeRef) {
      placeId = resolvePlace(cat, placeRef)
      if (!placeId) warnings.push(`Ort „${placeRef}“ unbekannt, kommt in den Eingang`)
    }
    const categoryRef = get('category')
    let categoryId: string | null = null
    if (categoryRef) {
      categoryId = resolveCategory(cat, categoryRef)
      if (!categoryId) warnings.push(`Kategorie „${categoryRef}“ unbekannt, wird ohne Kategorie angelegt`)
    }
    return {
      line: idx + 1 + (header ? 1 : 0), name, quantity, unit, approx, placeRef, placeId, categoryRef, categoryId,
      tags: get('tags').split(/[;,|]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean), notes: get('notes'),
      warnings, error: name ? null : 'Name fehlt',
    }
  })
  return { rows, header, delimiter }
}

export function rowToItem(r: BulkRow): ItemData {
  const d: ItemData = { name: r.name }
  if (r.quantity !== null) d.quantity = r.quantity
  if (r.unit) d.unit = r.unit
  if (r.approx) d.quantity_approx = true
  if (r.placeId) d.place_id = r.placeId
  if (r.categoryId) d.category_id = r.categoryId
  if (r.tags.length) d.tags = r.tags
  if (r.notes) d.notes = r.notes
  return d
}
