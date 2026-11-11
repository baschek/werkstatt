// Änderungen am Katalog: alles läuft über die lokale Kopie, der Sync-Motor sendet später.
import { uuid, nowIso } from '../data/id'
import { parseQuickAdd } from '../data/parser'
import type { ItemData, ItemDoc, ItemStatus, PlaceDoc } from '../data/types'
import { getApp, setUI, toast } from './store'

const repo = () => getApp().repo
const kick = () => getApp().engine.schedule()

export function createItem(data: ItemData): string {
  const id = uuid()
  repo().put('item', id, data)
  kick()
  return id
}
export function saveItem(id: string, data: ItemData) {
  repo().put('item', id, data)
  kick()
}
export function patchItem(id: string, patch: Partial<ItemData>) {
  repo().patch('item', id, patch)
  kick()
}

export function createItemsFromText(text: string, placeId: string | null): number {
  const lines = parseQuickAdd(text)
  for (const l of lines) {
    const data: ItemData = { name: l.name, quantity: l.quantity }
    if (l.unit) data.unit = l.unit
    if (l.approx) data.quantity_approx = true
    if (placeId) data.place_id = placeId
    createItem(data)
  }
  return lines.length
}

export function moveItems(ids: string[], placeId: string | null) {
  for (const id of ids) {
    const it = repo().get('item', id)
    if (!it) continue
    const patch: Partial<ItemData> = { place_id: placeId }
    if (placeId && it.data.status === 'inbox') patch.status = 'stored'
    if (placeId) patch.suggested_place_id = null
    repo().patch('item', id, patch)
  }
  kick()
}
/** Eingang → Ort ("Ablegen"). */
export function putAway(id: string, placeId: string) {
  repo().patch('item', id, { place_id: placeId, status: 'stored', suggested_place_id: null, status_since: nowIso() })
  kick()
}
export function setStatus(id: string, status: ItemStatus, extra: Partial<ItemData> = {}) {
  repo().patch('item', id, { status, status_since: nowIso(), ...(status === 'stored' ? { lent_to: null, in_use_note: null } : {}), ...extra })
  kick()
}
export function giveBack(item: ItemDoc) { setStatus(item.id, 'stored'); toast(`„${item.data.name}“ zurückgelegt`) }

export function movePlaces(ids: string[], parentId: string | null): boolean {
  const cat = repo().catalog
  for (const id of ids) {
    if (parentId && cat.subtreeIds(id).has(parentId)) { toast('Ein Ort kann nicht in sich selbst liegen'); return false }
  }
  for (const id of ids) repo().patch('place', id, { parent_id: parentId })
  kick()
  return true
}
export function deleteItem(id: string) { repo().remove('item', id); kick() }
export function deletePlace(p: PlaceDoc) {
  const cat = repo().catalog
  // Inhalt wandert in den Eingang, Unterorte eine Ebene hoch
  for (const it of cat.itemsIn(p.id)) repo().patch('item', it.id, { place_id: null, status: it.data.status === 'lent' || it.data.status === 'in_use' ? it.data.status : 'inbox' })
  for (const ch of cat.children(p.id)) repo().patch('place', ch.id, { parent_id: p.data.parent_id ?? null })
  repo().remove('place', p.id)
  kick()
}

export function openItem(id: string) {
  const cat = repo().catalog
  const it = cat.items.get(id)
  const placeId = it ? cat.itemPlace(it) : null
  setUI({ screen: 'search', view: 'detail', selItem: id, selPlace: placeId ? boxFor(placeId) : null, phoneTab: 'search' })
}
export function openPlace(id: string) {
  setUI({ screen: 'search', view: 'place', selItem: null, selPlace: id, phoneTab: 'search' })
}

/** Nächster Ort mit Geometrie (selbst oder darüber): dort liegt die Kiste im 3D-Bild. */
export function boxFor(placeId: string | null | undefined): string | null {
  const chain = repo().catalog.placeChain(placeId).reverse()
  return chain.find((p) => p.data.geometry?.size)?.id ?? null
}

/** Foto aufnehmen/auswählen: verkleinern, lokal ablegen, ID zurückgeben (Upload später mit PUT). */
export async function storePhoto(file: Blob): Promise<string> {
  const id = uuid()
  const blob = await shrinkImage(file)
  await repo().addPendingPhoto(id, blob)
  kick()
  return id
}

async function shrinkImage(file: Blob, max = 2000): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (k === 1 && file.type === 'image/jpeg') return file
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85))
  } catch { return file }
}
