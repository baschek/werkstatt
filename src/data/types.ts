// Datenformen nach docs/werkstatt-sync-protocol.md (TESS) – snake_case wie auf dem Draht.
export type Entity = 'place' | 'item' | 'category' | 'machine' | 'layout'
export type Origin = 'app' | 'web' | 'claude' | 'import'
export type Vec3 = [number, number, number]
export type ItemStatus = 'stored' | 'lent' | 'in_use' | 'inbox'
export type PlaceKind = 'zone' | 'shelf' | 'cabinet' | 'box' | 'drawer' | 'compartment' | 'bag' | 'machine' | 'other'
export type SpecType = 'text' | 'number' | 'date' | 'bool' | 'choice'
export type SpecValue = string | number | boolean | null

export interface Geometry {
  position?: Vec3
  size?: Vec3
  rotation_y?: number
  color?: string
}
export interface PlaceData {
  name: string
  human_id?: string | null
  kind?: PlaceKind | null
  parent_id?: string | null
  notes?: string | null
  tags?: string[]
  photo_ids?: string[]
  geometry?: Geometry | null
  sort_order?: number | null
  [extra: string]: unknown
}
export interface ItemData {
  name: string
  aliases?: string[]
  category_id?: string | null
  place_id?: string | null
  quantity?: number | null
  unit?: string | null
  tags?: string[]
  specs?: Record<string, SpecValue>
  photo_ids?: string[]
  notes?: string | null
  status?: ItemStatus | null
  lent_to?: string | null
  status_since?: string | null
  in_use_note?: string | null
  machine_id?: string | null
  [extra: string]: unknown
}
export interface SpecField {
  key: string
  label: string
  type: SpecType
  unit?: string | null
  choices?: string[]
  required?: boolean // Erweiterung der Oberfläche (Pflichtfeld), vom Server unverändert durchgereicht
}
export interface CategoryData {
  name: string
  parent_id?: string | null
  synonyms?: string[]
  spec_fields?: SpecField[]
  [extra: string]: unknown
}
export interface MachineData {
  name: string
  model?: string | null
  place_id?: string | null
  specs?: Record<string, SpecValue>
  links?: string[]
  notes?: string | null
  photo_ids?: string[]
  [extra: string]: unknown
}
export interface LayoutObject {
  id: string
  label?: string
  kind?: string
  position?: Vec3
  size?: Vec3
  rotation_y?: number
  color?: string
}
export interface LayoutData {
  room?: { size?: Vec3; floor_color?: string }
  objects?: LayoutObject[]
  camera?: { position?: Vec3; target?: Vec3; fov?: number }
  [extra: string]: unknown
}

export interface DataByEntity {
  place: PlaceData
  item: ItemData
  category: CategoryData
  machine: MachineData
  layout: LayoutData
}
export type AnyData = DataByEntity[Entity]

export interface Doc<E extends Entity = Entity> {
  id: string
  entity: E
  rev: number
  updated_at: string
  deleted: boolean
  origin: Origin
  data: DataByEntity[E]
}
export type PlaceDoc = Doc<'place'>
export type ItemDoc = Doc<'item'>
export type CategoryDoc = Doc<'category'>
export type MachineDoc = Doc<'machine'>
export type LayoutDoc = Doc<'layout'>

export const LAYOUT_ID = 'main'

export interface Op {
  op_id: string
  entity: Entity
  id: string
  op: 'upsert' | 'delete'
  base_rev: number | null
  client_updated_at: string
  data?: AnyData
}
export type OpStatus = 'applied' | 'conflict' | 'rejected'
export interface OpResult {
  op_id: string | null
  status: OpStatus
  document: Doc | null
  reason?: string
}
export interface PushResponse { results: OpResult[]; rev: number }
export interface ChangesResponse { changes: Doc[]; next_since: number; has_more: boolean }
export interface SnapshotResponse { rev: number; documents: Doc[] }
export interface StatusResponse { rev: number; server_time: string; documents: Record<string, number>; photos: number }
export interface PhotoMeta { photo_id: string; mime: string; bytes: number; sha256: string; width: number; height: number; has_thumb: boolean; created: boolean; created_at: string }

/** Fehler des Backends; `status` 0 = Netz weg. */
export class BackendError extends Error {
  constructor(public status: number, public code: string) {
    super(`${status} ${code}`)
  }
  get offline() { return this.status === 0 }
  get authLost() { return this.status === 404 || this.status === 401 }
  get resync() { return this.status === 410 }
}

export interface Backend {
  readonly kind: 'mock' | 'http'
  status(): Promise<StatusResponse>
  snapshot(): Promise<SnapshotResponse>
  changes(since: number, limit?: number): Promise<ChangesResponse>
  push(ops: Op[]): Promise<PushResponse>
  putPhoto(photoId: string, blob: Blob): Promise<PhotoMeta>
  getPhoto(photoId: string, thumb: boolean): Promise<Blob | null>
}

export interface PendingPhoto { photo_id: string; blob: Blob; created_at: string }

export const STATUS_LABEL: Record<ItemStatus, string> = {
  stored: 'Eingelagert', lent: 'Verliehen', in_use: 'In Nutzung', inbox: 'Eingang',
}
