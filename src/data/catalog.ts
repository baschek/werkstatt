import type { CategoryDoc, Doc, ItemDoc, ItemStatus, MachineDoc, PlaceDoc } from './types'

const MAX_DEPTH = 64

/** Lesesicht auf die lebenden Dokumente (gleiche Regeln wie TESS `werkstatt.Catalog`). */
export class Catalog {
  places = new Map<string, PlaceDoc>()
  items = new Map<string, ItemDoc>()
  categories = new Map<string, CategoryDoc>()
  machines = new Map<string, MachineDoc>()
  private childMap?: Map<string | null, PlaceDoc[]>

  constructor(docs: Iterable<Doc> = []) {
    for (const d of docs) {
      if (d.deleted) continue
      if (d.entity === 'place') this.places.set(d.id, d as PlaceDoc)
      else if (d.entity === 'item') this.items.set(d.id, d as ItemDoc)
      else if (d.entity === 'category') this.categories.set(d.id, d as CategoryDoc)
      else if (d.entity === 'machine') this.machines.set(d.id, d as MachineDoc)
    }
  }

  /** Orte unter einem Elternort (unbekannter Elternort = oberste Ebene), nach sort_order, Name. */
  children(parentId: string | null): PlaceDoc[] {
    if (!this.childMap) {
      const m = new Map<string | null, PlaceDoc[]>()
      for (const p of this.places.values()) {
        const par = p.data.parent_id && this.places.has(p.data.parent_id) && p.data.parent_id !== p.id ? p.data.parent_id : null
        const l = m.get(par) ?? []
        l.push(p)
        m.set(par, l)
      }
      for (const l of m.values()) l.sort((a, b) => (a.data.sort_order ?? 0) - (b.data.sort_order ?? 0) || a.data.name.localeCompare(b.data.name, 'de'))
      this.childMap = m
    }
    return this.childMap.get(parentId) ?? []
  }

  /** Von oben nach unten bis place_id; leer für den Eingang. */
  placeChain(placeId: string | null | undefined): PlaceDoc[] {
    const chain: PlaceDoc[] = []
    const seen = new Set<string>()
    let cur = placeId ?? null
    while (cur && this.places.has(cur) && !seen.has(cur) && seen.size < MAX_DEPTH) {
      seen.add(cur)
      const p = this.places.get(cur)!
      chain.push(p)
      cur = p.data.parent_id ?? null
    }
    return chain.reverse()
  }

  pathNames(placeId: string | null | undefined): string[] {
    return this.placeChain(placeId).map((p) => p.data.name)
  }
  path(placeId: string | null | undefined): string {
    const names = this.pathNames(placeId)
    return names.length ? names.join(' › ') : 'Eingang'
  }

  subtreeIds(placeId: string): Set<string> {
    const found = new Set<string>()
    const stack = [placeId]
    while (stack.length) {
      const c = stack.pop()!
      if (found.has(c)) continue
      found.add(c)
      for (const ch of this.children(c)) stack.push(ch.id)
    }
    return found
  }

  itemPlace(item: ItemDoc): string | null {
    const id = item.data.place_id
    return id && this.places.has(id) ? id : null
  }
  itemsIn(placeId: string): ItemDoc[] {
    return [...this.items.values()].filter((i) => this.itemPlace(i) === placeId)
  }
  effectiveStatus(item: ItemDoc): ItemStatus {
    const s = item.data.status
    if (s === 'lent' || s === 'in_use') return s
    return this.itemPlace(item) ? 'stored' : 'inbox'
  }

  categoryChain(categoryId: string | null | undefined): CategoryDoc[] {
    const chain: CategoryDoc[] = []
    const seen = new Set<string>()
    let cur = categoryId ?? null
    while (cur && this.categories.has(cur) && !seen.has(cur) && seen.size < MAX_DEPTH) {
      seen.add(cur)
      const c = this.categories.get(cur)!
      chain.push(c)
      cur = c.data.parent_id ?? null
    }
    return chain.reverse()
  }
  categoryPath(categoryId: string | null | undefined): string {
    return this.categoryChain(categoryId).map((c) => c.data.name).join(' › ')
  }
  categorySubtreeIds(id: string): Set<string> {
    const found = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const c of this.categories.values()) {
        if (!found.has(c.id) && c.data.parent_id && found.has(c.data.parent_id)) {
          found.add(c.id)
          changed = true
        }
      }
    }
    return found
  }
  /** Spezifikationsfelder einer Kategorie inkl. Oberkategorien (nähere gewinnen). */
  specFields(categoryId: string | null | undefined) {
    const merged = new Map<string, import('./types').SpecField>()
    for (const c of this.categoryChain(categoryId)) for (const f of c.data.spec_fields ?? []) merged.set(f.key, f)
    return [...merged.values()]
  }
  machineItems(machineId: string): ItemDoc[] {
    return [...this.items.values()].filter((i) => i.data.machine_id === machineId)
  }
}
