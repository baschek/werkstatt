import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getApp } from './store'
import type { Catalog } from '../data/catalog'
import type { SyncState } from '../data/sync'
import { search, type SearchResult } from '../data/search'
import type { ItemStatus } from '../data/types'

export function useCatalog(): Catalog {
  const { repo } = getApp()
  useSyncExternalStore(repo.subscribe, repo.getVersion)
  return repo.catalog
}
export function useRepoState() {
  const { repo } = getApp()
  useSyncExternalStore(repo.subscribe, repo.getVersion)
  return repo
}
export function useSync(): SyncState {
  const { engine } = getApp()
  return useSyncExternalStore(engine.subscribe, engine.getState)
}

export function useSearch(query: string, status: ItemStatus | null): SearchResult[] {
  const cat = useCatalog()
  return useMemo(() => {
    const all = search(cat, query, { status, limit: 200, types: status || !query.trim() ? ['item'] : ['item', 'place', 'machine'] }).results
    // Dinge zuerst (wie im Prototyp), dann Maschinen, dann Orte mit Code; Fächer ohne Code sind nur Rauschen
    const rank = { item: 0, machine: 1, place: 2 } as const
    return all.filter((r) => r.kind !== 'place' || cat.places.get(r.id)?.data.human_id).sort((a, b) => rank[a.kind] - rank[b.kind])
  }, [cat, query, status])
}

export function useMedia(q: string): boolean {
  const [m, setM] = useState(() => (typeof matchMedia === 'undefined' ? false : matchMedia(q).matches))
  useEffect(() => {
    const mq = matchMedia(q)
    const f = () => setM(mq.matches)
    mq.addEventListener('change', f)
    f()
    return () => mq.removeEventListener('change', f)
  }, [q])
  return m
}

/** Foto als Blob-URL (zuerst lokale Kopie, sonst vom Server, dann zwischengespeichert). */
export function usePhotoUrl(photoId: string | undefined, thumb = true): string | null {
  const { repo, engine } = getApp()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let dead = false
    let made: string | null = null
    if (!photoId) { setUrl(null); return }
    void (async () => {
      let blob = (await repo.cachedPhoto(photoId, thumb)) ?? (thumb ? await repo.cachedPhoto(photoId, false) : undefined)
      if (!blob) {
        try {
          const got = await engine.backend.getPhoto(photoId, thumb)
          if (got) { blob = got; await repo.cachePhoto(photoId, thumb, got) }
        } catch { /* offline: Platzhalter */ }
      }
      if (blob && !dead) { made = URL.createObjectURL(blob); setUrl(made) }
    })()
    return () => { dead = true; if (made) URL.revokeObjectURL(made) }
  }, [photoId, thumb, repo, engine])
  return url
}
