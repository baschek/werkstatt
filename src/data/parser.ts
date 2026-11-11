// Schnell-Hinzufügen: grobe Liste (Komma, Semikolon, Zeilenumbruch) → Dinge mit Menge.
// Erkannt: "2x Name", "Name ~200", "Name 5 Stück" (auch Einheiten wie kg, m, Rolle); ohne Menge "1".
export interface ParsedLine {
  raw: string
  name: string
  quantity: number
  unit: string | null
  approx: boolean
}

const UNITS = 'Stück|Stk\\.?|St\\.?|Stuck|kg|g|mg|l|ml|m|cm|mm|Rollen?|Packung(?:en)?|Pack|Box(?:en)?|Satz|Sätze|Paar|Meter'
const NUM = '\\d+(?:[.,]\\d+)?'

export function parseNumber(s: string): number {
  return Number(s.replace(',', '.'))
}

function normUnit(u: string): string {
  const l = u.toLowerCase().replace(/\.$/, '')
  if (['st', 'stk', 'stück', 'stuck'].includes(l)) return 'Stück'
  if (l === 'meter') return 'm'
  if (l === 'rollen') return 'Rolle'
  if (l === 'packungen') return 'Packung'
  if (l === 'boxen') return 'Box'
  if (l === 'sätze') return 'Satz'
  return ['kg', 'g', 'mg', 'l', 'ml', 'm', 'cm', 'mm'].includes(l) ? l : u[0].toUpperCase() + u.slice(1)
}

export function splitList(text: string): string[] {
  return text.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
}

export function parseLine(line: string): ParsedLine {
  const raw = line.trim()
  let m: RegExpMatchArray | null
  if ((m = raw.match(new RegExp(`^(${NUM})\\s*[x×]\\s+(.+)$`, 'i')))) {
    return { raw, name: m[2].trim(), quantity: parseNumber(m[1]), unit: 'Stück', approx: false }
  }
  if ((m = raw.match(new RegExp(`^(.+?)\\s*~\\s*(${NUM})$`)))) {
    return { raw, name: m[1].trim(), quantity: parseNumber(m[2]), unit: null, approx: true }
  }
  if ((m = raw.match(new RegExp(`^(.+?)\\s+(${NUM})\\s*(${UNITS})$`, 'i')))) {
    return { raw, name: m[1].trim(), quantity: parseNumber(m[2]), unit: normUnit(m[3]), approx: false }
  }
  return { raw, name: raw, quantity: 1, unit: null, approx: false }
}

export function parseQuickAdd(text: string): ParsedLine[] {
  return splitList(text).map(parseLine)
}

/** Menge für die Anzeige: "4 Stück", "~200", "0,7 kg", "1". */
export function formatQuantity(q: number | null | undefined, unit?: string | null, approx?: boolean): string {
  if (q === null || q === undefined) return '–'
  const n = String(q).replace('.', ',')
  return `${approx ? '~' : ''}${n}${unit ? ' ' + unit : ''}`
}
