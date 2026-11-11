import type { Catalog } from '../data/catalog'
import { formatQuantity } from '../data/parser'
import type { ItemDoc, SpecField, SpecValue } from '../data/types'

/** "R2 › K2 › Fach 1": ab dem letzten Ort mit Code, davor weg. Ohne Codes: Namen ohne obersten Raum. */
export function shortPath(cat: Catalog, placeId: string | null | undefined): string {
  const chain = cat.placeChain(placeId)
  if (!chain.length) return 'noch kein Ort'
  let idx = -1
  chain.forEach((p, i) => { if (p.data.human_id) idx = i })
  if (idx >= 0) {
    const code = chain[idx].data.human_id!.split('-').join(' › ')
    return [code, ...chain.slice(idx + 1).map((p) => p.data.name)].join(' › ')
  }
  return chain.slice(chain.length > 1 ? 1 : 0).map((p) => p.data.name).join(' › ')
}

export function qtyText(i: ItemDoc): string {
  return formatQuantity(i.data.quantity ?? null, i.data.unit, !!i.data.quantity_approx)
}

export function dateDe(iso: string | null | undefined, withYear = false): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const base = `${d.getDate()}.${d.getMonth() + 1}.`
  return withYear ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : base
}
export function timeDe(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "bei Paul seit 3.11." / "im Drucker seit 9.11." */
export function whereAbout(i: ItemDoc): string {
  const d = i.data
  const s = d.status === 'lent' ? (d.lent_to ? `an ${d.lent_to}` : 'verliehen') : d.status === 'in_use' ? (d.in_use_note ?? 'in Nutzung') : ''
  return s
}
export function since(i: ItemDoc): string { return dateDe(i.data.status_since) }

export function humanKey(key: string): string {
  const s = key.replace(/[_.]+/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function specLabel(fields: SpecField[], key: string): string {
  return fields.find((f) => f.key === key)?.label ?? humanKey(key)
}
export function specValueText(fields: SpecField[], key: string, v: SpecValue): string {
  const f = fields.find((x) => x.key === key)
  if (v === null || v === undefined || v === '') return '–'
  if (typeof v === 'boolean') return v ? 'ja' : 'nein'
  let s = String(v).replace(/^(\d+)\.(\d+)$/, (_m, a, b) => `${a},${b}`)
  if (f?.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) { const [y, m, d] = String(v).split('-'); s = `${d}.${m}.${y}` }
  return f?.unit && !s.endsWith(f.unit) ? `${s} ${f.unit}` : s
}
