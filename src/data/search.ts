// Lokale Suche: Port von TESS src/tess/werkstatt_search.py (docs/werkstatt-sync-protocol.md, "Search algorithm").
import type { Catalog } from './catalog'
import type { ItemStatus } from './types'

export const MAX_TERMS = 8
export const MAX_QUERY_CHARS = 200
export const SYNONYM_FACTOR = 0.9
export const FIELD_WEIGHTS: Record<string, number> = {
  name: 10, human_id: 10, alias: 8, model: 6, tag: 5, category: 4, spec: 3, notes: 2, place: 2, ancestor: 1,
}
const NAME_EQUALS_BONUS = 10
const NAME_PHRASE_BONUS = 5
const CODE_BONUS = 15
export const STOPWORDS = new Set([
  'wo', 'ist', 'sind', 'die', 'der', 'das', 'den', 'dem', 'ein', 'eine', 'einen', 'mein', 'meine', 'meinen', 'ich',
  'suche', 'habe', 'hab', 'liegt', 'liegen', 'im', 'in', 'auf', 'nach', 'mit', 'und', 'oder', 'von', 'the', 'a', 'an',
  'my', 'where', 'is', 'are', 'of', 'to', 'for',
])
export const SEED_SYNONYMS: string[][] = [
  ['Akku', 'Akkus', 'Batterie', 'Batterien', 'LiPo', 'Accu', 'Akkupack', 'Battery', 'Batteries'],
  ['Schraube', 'Schrauben', 'Screw', 'Screws'],
  ['Mutter', 'Muttern', 'Nut', 'Nuts'],
  ['Unterlegscheibe', 'Unterlegscheiben', 'Washer', 'Washers'],
  ['Filament', 'Filamente', 'PLA', 'PETG', 'TPU'],
  ['Fräser', 'Schaftfräser', 'Endmill', 'End Mill', 'Milling Cutter'],
  ['Bohrer', 'Spiralbohrer', 'Drill', 'Drill Bit'],
  ['Akkuschrauber', 'Akkubohrer', 'Cordless Drill'],
  ['Schraubendreher', 'Schraubenzieher', 'Screwdriver'],
  ['Zange', 'Zangen', 'Pliers'],
  ['Kabel', 'Leitung', 'Cable', 'Wire'],
  ['Kleber', 'Klebstoff', 'Glue', 'Adhesive'],
  ['Klebeband', 'Tape', 'Gewebeband'],
  ['Säge', 'Sägeblatt', 'Saw'],
  ['Lötzinn', 'Lötdraht', 'Solder'],
  ['Netzteil', 'Ladegerät', 'Charger', 'Power Supply'],
  ['Sicherung', 'Sicherungen', 'Fuse', 'Fuses'],
  ['Schalter', 'Taster', 'Switch'],
  ['Lüfter', 'Ventilator', 'Fan'],
  ['Werkzeug', 'Werkzeuge', 'Tool', 'Tools'],
]

export function fold(text: string): string {
  const t = text.toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
  return t.normalize('NFD').replace(/\p{Mn}/gu, '')
}
export function tokens(text: unknown): string[] {
  return typeof text === 'string' ? (fold(text).match(/[\p{L}\p{N}]+/gu) ?? []) : []
}
export function compact(text: unknown): string {
  return tokens(text).join('')
}
export function typoLimit(len: number): number {
  return len < 4 ? 0 : len < 8 ? 1 : 2
}
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prev2: number[] | null = null
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0)
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], prev2[j - 2] + 1)
    }
    if (Math.min(...row) > limit) return limit + 1
    prev2 = prev
    prev = row
  }
  return prev[prev.length - 1]
}
export function matchQuality(q: string, d: string): number {
  if (q === d) return 1
  if (q.length >= 2 && d.startsWith(q)) return 0.8
  if (q.length >= 3 && d.includes(q)) return 0.6
  if (d.length >= 4 && q.startsWith(d) && q.length - d.length <= 3) return 0.5
  const limit = typoLimit(q.length)
  if (limit) {
    const dist = editDistance(q, d, limit)
    if (dist <= limit) return dist === 1 ? 0.5 : 0.4
  }
  return 0
}

type Phrase = string[]
const key = (p: Phrase) => p.join('\u0000')

export class Synonyms {
  private index = new Map<string, { phrase: Phrase; alts: Map<string, Phrase> }>()
  longest = 1
  constructor(groups: string[][]) {
    for (const group of groups) {
      const phrases = new Map<string, Phrase>()
      for (const e of group) {
        const p = tokens(e)
        if (p.length) phrases.set(key(p), p)
      }
      for (const [k, p] of phrases) {
        const entry = this.index.get(k) ?? { phrase: p, alts: new Map() }
        for (const [k2, p2] of phrases) if (k2 !== k) entry.alts.set(k2, p2)
        this.index.set(k, entry)
        this.longest = Math.max(this.longest, p.length)
      }
    }
  }
  alternatives(p: Phrase): Phrase[] {
    const e = this.index.get(key(p))
    if (!e) return []
    return [...e.alts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((x) => x[1])
  }
  known(p: Phrase) { return this.index.has(key(p)) }
}

export function buildSynonyms(cat: Catalog, seed: string[][] = SEED_SYNONYMS): Synonyms {
  const groups = seed.map((g) => [...g])
  for (const c of cat.categories.values()) {
    const names = [c.data.name, ...(c.data.synonyms ?? [])]
    if (names.length > 1) groups.push(names)
  }
  return new Synonyms(groups)
}

type Field = [string, string[]]
type Kind = 'item' | 'place' | 'machine'
type AnyDoc = { id: string; data: Record<string, unknown> }

function specTexts(specs: unknown): string[] {
  if (!specs || typeof specs !== 'object') return []
  return Object.values(specs as Record<string, unknown>).filter((v) => v !== null && v !== undefined && typeof v !== 'boolean').map(String)
}

function docFields(cat: Catalog, kind: Kind, doc: AnyDoc): Field[] {
  const data = doc.data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const fields: Field[] = [['name', tokens(data.name)]]
  for (const a of data.aliases ?? []) fields.push(['alias', tokens(a)])
  for (const t of data.tags ?? []) fields.push(['tag', tokens(t)])
  fields.push(['notes', tokens(data.notes)])
  for (const t of specTexts(data.specs)) fields.push(['spec', tokens(t)])
  if (kind === 'place') {
    fields.push(['human_id', tokens(data.human_id)])
    for (const n of cat.placeChain(doc.id).slice(0, -1)) fields.push(['ancestor', tokens(n.data.name)])
  } else {
    const placeId = kind === 'item' ? cat.itemPlace(doc as never) : data.place_id && cat.places.has(data.place_id) ? data.place_id : null
    const chain = cat.placeChain(placeId)
    if (chain.length) {
      const here = chain[chain.length - 1].data
      fields.push(['place', [...tokens(here.name), ...tokens(here.human_id)]])
      for (const p of chain.slice(0, -1)) fields.push(['ancestor', tokens(p.data.name)])
    }
  }
  if (kind === 'item') for (const c of cat.categoryChain(data.category_id)) fields.push(['category', tokens(c.data.name)])
  if (kind === 'machine') fields.push(['model', tokens(data.model)])
  return fields.filter(([, t]) => t.length)
}

function queryTerms(text: string, syn: Synonyms): Phrase[][] {
  const raw = tokens(text.slice(0, MAX_QUERY_CHARS))
  const filtered = raw.filter((t) => !STOPWORDS.has(t))
  const words = filtered.length ? filtered : raw
  const terms: Phrase[][] = []
  let i = 0
  while (i < words.length && terms.length < MAX_TERMS) {
    let phrase: Phrase = [words[i]]
    for (let size = Math.min(syn.longest, words.length - i); size > 1; size--) {
      const cand = words.slice(i, i + size)
      if (syn.known(cand)) { phrase = cand; break }
    }
    terms.push([phrase, ...syn.alternatives(phrase)])
    i += phrase.length
  }
  return terms
}

function phraseScore(phrase: Phrase, fields: Field[]): [number, string] | null {
  let total = 0
  let fieldName = ''
  for (const word of phrase) {
    let best = 0
    let bestField = ''
    for (const [name, toks] of fields) {
      const w = FIELD_WEIGHTS[name]
      for (const t of toks) {
        const q = matchQuality(word, t)
        if (q && w * q > best) { best = w * q; bestField = name }
      }
    }
    if (!best) return null
    total += best
    fieldName = fieldName || bestField
  }
  return [total / phrase.length, fieldName]
}

function termScore(term: Phrase[], fields: Field[]): [number, string] | null {
  let best: [number, string] | null = null
  term.forEach((phrase, pos) => {
    const s = phraseScore(phrase, fields)
    if (!s) return
    const v = s[0] * (pos === 0 ? 1 : SYNONYM_FACTOR)
    if (!best || v > best[0]) best = [v, s[1]]
  })
  return best
}

function arrEq(a: string[], b: string[]) { return a.length === b.length && a.every((x, i) => x === b[i]) }

function bonus(qt: string[], qc: string, kind: Kind, doc: AnyDoc): number {
  const nt = tokens(doc.data.name)
  let b = 0
  if (qt.length && arrEq(nt, qt)) b += NAME_EQUALS_BONUS
  else if (qt.length) {
    for (let i = 0; i + qt.length <= nt.length; i++) if (arrEq(nt.slice(i, i + qt.length), qt)) { b += NAME_PHRASE_BONUS; break }
  }
  if (kind === 'place' && qc && compact(doc.data.human_id) === qc) b += CODE_BONUS
  return b
}

export function resolvePlace(cat: Catalog, ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.trim()) return null
  const r = ref.trim()
  if (cat.places.has(r)) return r
  const wanted = fold(r)
  const byCode = [...cat.places.values()].filter((p) => p.data.human_id && fold(p.data.human_id) === wanted)
  if (byCode.length === 1) return byCode[0].id
  const byName = [...cat.places.values()].filter((p) => fold(p.data.name) === wanted)
  return byName.length === 1 && !byCode.length ? byName[0].id : null
}
export function resolveCategory(cat: Catalog, ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.trim()) return null
  const r = ref.trim()
  if (cat.categories.has(r)) return r
  const wanted = fold(r)
  const byName = [...cat.categories.values()].filter((c) => fold(c.data.name) === wanted)
  if (byName.length === 1) return byName[0].id
  if (byName.length) return null
  const bySyn = [...cat.categories.values()].filter((c) => (c.data.synonyms ?? []).some((s) => fold(s) === wanted))
  return bySyn.length === 1 ? bySyn[0].id : null
}

export interface SearchOptions {
  category?: string | null
  tag?: string | null
  status?: ItemStatus | null
  place?: string | null
  types?: Kind[]
  limit?: number
  seed?: string[][]
}
export interface SearchResult { kind: Kind; id: string; score: number; partial: boolean; matched: string[] }
export interface SearchResponse { results: SearchResult[]; total: number; unresolved: string[] }

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function search(cat: Catalog, query = '', opts: SearchOptions = {}): SearchResponse {
  const { limit = 20 } = opts
  const syn = buildSynonyms(cat, opts.seed)
  const unresolved: string[] = []
  let wanted: Kind[] = opts.types ?? ['item', 'place', 'machine']
  let categoryIds: Set<string> | null = null
  let placeIds: Set<string> | null = null
  let foundPlace: string | null = null
  if (opts.category != null) {
    const f = resolveCategory(cat, opts.category)
    if (!f) unresolved.push('category')
    categoryIds = f ? cat.categorySubtreeIds(f) : new Set()
    wanted = wanted.filter((t) => t === 'item')
  }
  if (opts.status != null) wanted = wanted.filter((t) => t === 'item')
  if (opts.place != null) {
    foundPlace = resolvePlace(cat, opts.place)
    if (!foundPlace) unresolved.push('place')
    placeIds = foundPlace ? cat.subtreeIds(foundPlace) : new Set()
  }
  const tagKey = typeof opts.tag === 'string' ? fold(opts.tag).trim() : null

  const cands: [Kind, AnyDoc][] = []
  const sources: [Kind, Iterable<AnyDoc>][] = [['item', cat.items.values()], ['place', cat.places.values()], ['machine', cat.machines.values()]]
  for (const [kind, src] of sources) {
    if (!wanted.includes(kind)) continue
    for (const doc of src) {
      const data = doc.data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
      if (categoryIds && !categoryIds.has(data.category_id)) continue
      if (opts.status != null && cat.effectiveStatus(doc as never) !== opts.status) continue
      if (placeIds) {
        const where = kind === 'item' ? cat.itemPlace(doc as never) : kind === 'place' ? doc.id : data.place_id && cat.places.has(data.place_id) ? data.place_id : null
        if (!where || !placeIds.has(where) || (kind === 'place' && doc.id === foundPlace)) continue
      }
      if (tagKey && !(data.tags ?? []).some((t: string) => fold(t).trim() === tagKey)) continue
      cands.push([kind, doc])
    }
  }

  const terms = queryTerms(query, syn)
  if (!terms.length) {
    const ordered = cands.sort((a, b) => cmp(fold(a[1].data.name as string), fold(b[1].data.name as string)) || cmp(a[1].id, b[1].id))
    const results = ordered.map(([k, d]) => ({ kind: k, id: d.id, score: 0, partial: false, matched: [] as string[] }))
    return { results: results.slice(0, limit), total: results.length, unresolved }
  }
  const rawQ = tokens(query.slice(0, MAX_QUERY_CHARS))
  const fq = rawQ.filter((t) => !STOPWORDS.has(t))
  const qt = fq.length ? fq : rawQ
  const qc = qt.join('')
  type Row = SearchResult & { hits: number; name: string }
  const full: Row[] = []
  const partial: Row[] = []
  for (const [kind, doc] of cands) {
    const fields = docFields(cat, kind, doc)
    const scores = terms.map((t) => termScore(t, fields))
    let hits = scores.filter((s): s is [number, string] => s !== null)
    if (kind === 'place' && qc && compact(doc.data.human_id) === qc && hits.length < terms.length) {
      hits = terms.map(() => [FIELD_WEIGHTS.human_id, 'human_id'] as [number, string])
    }
    if (!hits.length) continue
    const score = hits.reduce((s, h) => s + h[0], 0) + bonus(qt, qc, kind, doc)
    const row: Row = {
      kind, id: doc.id, score: Math.round(score * 1e6) / 1e6, partial: hits.length < terms.length,
      matched: [...new Set(hits.map((h) => h[1]))].sort(), hits: hits.length, name: fold(doc.data.name as string),
    }
    ;(hits.length === terms.length ? full : partial).push(row)
  }
  const chosen = full.length ? full : partial
  chosen.sort((a, b) => b.hits - a.hits || b.score - a.score || cmp(a.name, b.name) || cmp(a.id, b.id))
  const results: SearchResult[] = chosen.map(({ kind, id, score, partial: p, matched }) => ({ kind, id, score, partial: p, matched }))
  return { results: results.slice(0, limit), total: results.length, unresolved }
}
