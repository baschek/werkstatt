import { describe, expect, it } from 'vitest'
import golden from './fixtures/werkstatt_search_golden.json'
import { Catalog } from '../src/data/catalog'
import { SEED_SYNONYMS, STOPWORDS, FIELD_WEIGHTS, SYNONYM_FACTOR, compact, editDistance, fold, matchQuality, search, tokens } from '../src/data/search'
import type { Doc, Entity } from '../src/data/types'

// Quelle der Fixture: TESS tests/fixtures/werkstatt_search_golden.json (unverändert kopiert).
const g = golden as any // eslint-disable-line @typescript-eslint/no-explicit-any
const mk = (entity: Entity, rows: any[]): Doc[] => rows.map((r) => ({ id: r.id, entity, rev: 1, updated_at: '2026-01-01T00:00:00.000Z', deleted: false, origin: 'import', data: r.data })) // eslint-disable-line @typescript-eslint/no-explicit-any
const cat = new Catalog([...mk('place', g.catalog.places), ...mk('item', g.catalog.items), ...mk('category', g.catalog.categories), ...mk('machine', g.catalog.machines)])

describe('Konstanten wie in der Fixture', () => {
  it('Stoppwörter, Synonyme, Gewichte', () => {
    expect([...STOPWORDS].sort()).toEqual([...g.stopwords].sort())
    expect(SEED_SYNONYMS).toEqual(g.synonym_seed)
    expect(FIELD_WEIGHTS.name).toBe(g.weights.name)
    expect(FIELD_WEIGHTS.ancestor).toBe(g.weights.ancestor)
    expect(SYNONYM_FACTOR).toBe(g.weights.synonym_factor)
  })
})
describe('Textfunktionen', () => {
  it('fold', () => g.fold_cases.forEach(([i, o]: [string, string]) => expect(fold(i)).toBe(o === 'aeoeue' ? 'aeoeue' : o)))
  it('tokens', () => g.token_cases.forEach(([i, o]: [string, string[]]) => expect(tokens(i)).toEqual(o)))
  it('compact', () => expect(compact('R2-K5')).toBe('r2k5'))
  it('Editierabstand', () => g.edit_distance_cases.forEach(([a, b, lim, d]: [string, string, number, number]) => expect(editDistance(a, b, lim)).toBe(d)))
  it('Trefferqualität', () => g.match_quality_cases.forEach(([q, d, v]: [string, string, number]) => expect(matchQuality(q, d)).toBe(v)))
})
describe('Golden-Fälle', () => {
  for (const c of g.cases) {
    it(c.name, () => {
      const f = c.filters ?? {}
      const r = search(cat, c.query, { ...f, limit: 50 })
      const ids = r.results.map((x) => x.id)
      const e = c.expect
      if (e.first) expect(ids[0]).toBe(e.first)
      if (e.ordered) expect(ids.slice(0, e.ordered.length)).toEqual(e.ordered)
      if (e.exactly) expect(ids).toEqual(e.exactly)
      if (e.exactly_unordered) expect([...ids].sort()).toEqual([...e.exactly_unordered].sort())
      for (const id of e.contains ?? []) expect(ids).toContain(id)
      for (const id of e.absent ?? []) expect(ids).not.toContain(id)
      if (e.empty) expect(ids).toEqual([])
      if (e.all_partial) expect(r.results.every((x) => x.partial)).toBe(true)
      if (e.unresolved) expect(r.unresolved).toEqual(e.unresolved)
    })
  }
})
