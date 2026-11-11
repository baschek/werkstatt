// Lokale Kopie (IndexedDB) + Outbox. Alle Änderungen gehen zuerst hierher (optimistisch) und werden vom Sync-Motor gesendet.
import { openDB, type IDBPDatabase } from 'idb'
import { Catalog } from './catalog'
import { nowIso, uuid } from './id'
import type { AnyData, Doc, Entity, Op, Origin, PendingPhoto } from './types'

export interface Meta {
  cursor: number | null
  lastSyncAt: string | null
}

export type Notice =
  | { kind: 'conflict'; id: string; entity: Entity; name: string; mine: AnyData | null; theirs: AnyData | null; winner: 'mine' | 'theirs'; at: string; theirsOrigin?: Origin }
  | { kind: 'rejected'; id: string; entity: Entity; name: string; reason: string; at: string }

const key = (entity: string, id: string) => `${entity}:${id}`
export const docKey = key

export class Repo {
  private docs = new Map<string, Doc>()
  outbox: Op[] = []
  inflight = new Set<string>()
  meta: Meta = { cursor: null, lastSyncAt: null }
  notices: Notice[] = []
  version = 0
  private listeners = new Set<() => void>()
  private catalogCache?: { v: number; c: Catalog }
  private writes: Promise<unknown> = Promise.resolve()
  readonly origin: Origin = 'app'

  private constructor(private db: IDBPDatabase | null) {}

  static async open(name = 'werkstatt'): Promise<Repo> {
    let db: IDBPDatabase | null
    try {
      db = await openDB(name, 1, {
        upgrade(d) {
          d.createObjectStore('docs')
          d.createObjectStore('outbox', { keyPath: 'op_id' })
          d.createObjectStore('meta')
          d.createObjectStore('pending_photos', { keyPath: 'photo_id' })
          d.createObjectStore('photo_cache')
          d.createObjectStore('kv')
        },
      })
    } catch {
      db = null // z. B. privates Fenster: läuft nur im Speicher
    }
    const r = new Repo(db)
    if (db) {
      const [docs, ops, meta, notices] = await Promise.all([
        db.getAll('docs'), db.getAll('outbox'), db.get('meta', 'meta'), db.get('meta', 'notices'),
      ])
      for (const d of docs as Doc[]) r.docs.set(key(d.entity, d.id), d)
      r.outbox = (ops as (Op & { seq: number })[]).sort((a, b) => a.seq - b.seq)
      if (meta) r.meta = meta
      if (notices) r.notices = notices
    }
    return r
  }

  // --- React ---
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  getVersion = () => this.version
  private bump() { this.version++; this.listeners.forEach((l) => l()) }
  /** Wartet, bis alle Schreibvorgänge in IndexedDB durch sind (Tests). */
  idle() { return this.writes }
  private persist(fn: (db: IDBPDatabase) => Promise<unknown>) {
    const db = this.db
    if (!db) return
    this.writes = this.writes.then(() => fn(db)).catch(() => undefined)
  }

  // --- Lesen ---
  get catalog(): Catalog {
    if (!this.catalogCache || this.catalogCache.v !== this.version) this.catalogCache = { v: this.version, c: new Catalog(this.docs.values()) }
    return this.catalogCache.c
  }
  get<E extends Entity>(entity: E, id: string): Doc<E> | undefined { return this.docs.get(key(entity, id)) as Doc<E> | undefined }
  all(): Doc[] { return [...this.docs.values()] }
  get layout() { return this.get('layout', 'main') }
  get pendingCount() { return this.outbox.length }
  hasPending(entity: Entity, id: string) { return this.outbox.some((o) => o.entity === entity && o.id === id) }

  // --- Eigene Änderungen (optimistisch) ---
  put<E extends Entity>(entity: E, id: string, data: Doc<E>['data'], at = nowIso()): Doc<E> {
    const prev = this.get(entity, id)
    const doc = { id, entity, rev: prev?.rev ?? 0, updated_at: at, deleted: false, origin: this.origin, data } as Doc<E>
    this.docs.set(key(entity, id), doc as Doc)
    const baseRev = prev && prev.rev > 0 ? prev.rev : null
    this.queue({ entity, id, op: 'upsert', base_rev: baseRev, client_updated_at: at, data })
    this.persist((db) => db.put('docs', doc, key(entity, id)))
    this.bump()
    return doc
  }
  /** Ändert nur Felder; fehlende Felder bleiben (inkl. unbekannter). */
  patch<E extends Entity>(entity: E, id: string, patch: Partial<Doc<E>['data']>, at = nowIso()): Doc<E> {
    const prev = this.get(entity, id)
    if (!prev) throw new Error(`Dokument fehlt: ${entity}/${id}`)
    const data = { ...prev.data, ...patch } as Doc<E>['data']
    for (const k of Object.keys(data)) if ((data as Record<string, unknown>)[k] === undefined) delete (data as Record<string, unknown>)[k]
    return this.put(entity, id, data, at)
  }
  remove(entity: Entity, id: string, at = nowIso()) {
    const prev = this.get(entity, id)
    this.docs.delete(key(entity, id))
    this.persist((db) => db.delete('docs', key(entity, id)))
    if (prev && prev.rev > 0) this.queue({ entity, id, op: 'delete', base_rev: prev.rev, client_updated_at: at })
    else this.dropOps(entity, id) // nie auf dem Server gewesen
    this.bump()
  }

  private queue(o: Omit<Op, 'op_id'>) {
    const existing = this.outbox.find((x) => x.entity === o.entity && x.id === o.id && !this.inflight.has(x.op_id))
    // Ungesendete Ops desselben Dokuments werden zusammengefasst (Op unterwegs bleibt unberührt).
    if (existing) {
      if (o.op === 'delete' && existing.base_rev === null) {
        this.dropOps(o.entity, o.id)
        return
      }
      existing.op = o.op
      existing.data = o.data
      existing.client_updated_at = o.client_updated_at
      this.saveOp(existing)
      return
    }
    const hasInflight = this.outbox.some((x) => x.entity === o.entity && x.id === o.id && this.inflight.has(x.op_id))
    const op: Op = { ...o, op_id: uuid(), base_rev: hasInflight ? -1 : o.base_rev }
    this.outbox.push(op)
    this.saveOp(op)
  }
  private seq = Date.now()
  private saveOp(op: Op) {
    const rec = Object.assign(op, { seq: (op as Op & { seq?: number }).seq ?? this.seq++ })
    this.persist((db) => db.put('outbox', { ...rec }))
  }
  private dropOps(entity: Entity, id: string) {
    const gone = this.outbox.filter((x) => x.entity === entity && x.id === id && !this.inflight.has(x.op_id))
    this.outbox = this.outbox.filter((x) => !gone.includes(x))
    for (const g of gone) this.persist((db) => db.delete('outbox', g.op_id))
  }

  // --- Vom Sync-Motor ---
  /** Eine Op fertig (applied/conflict/rejected): Op entfernen, Folge-Ops auf die neue rev stellen. */
  finishOp(op: Op, serverDoc: Doc | null, mode: 'replace' | 'keep-local') {
    this.outbox = this.outbox.filter((x) => x.op_id !== op.op_id)
    this.inflight.delete(op.op_id)
    this.persist((db) => db.delete('outbox', op.op_id))
    const later = this.outbox.filter((x) => x.entity === op.entity && x.id === op.id)
    if (serverDoc && later.length) {
      for (const l of later) if (l.base_rev === -1 || l.base_rev === null || l.base_rev < serverDoc.rev) { l.base_rev = serverDoc.rev; this.saveOp(l) }
    }
    if (mode === 'replace') {
      if (!later.length) this.setServerDoc(op.entity, op.id, serverDoc, false)
      else if (serverDoc) {
        const cur = this.get(op.entity, op.id)
        if (cur) { this.docs.set(key(op.entity, op.id), { ...cur, rev: serverDoc.rev }); this.persist((db) => db.put('docs', this.docs.get(key(op.entity, op.id)), key(op.entity, op.id))) }
      }
    }
    this.bump()
  }
  /** Dokument vom Server übernehmen (null/gelöscht = lokal entfernen). Offene eigene Ops gewinnen lokal. */
  setServerDoc(entity: Entity, id: string, doc: Doc | null, respectPending = true) {
    if (respectPending && this.hasPending(entity, id)) {
      const cur = this.get(entity, id)
      if (doc && !doc.deleted && cur) { // nur rev nachziehen
        this.docs.set(key(entity, id), { ...cur, rev: doc.rev })
        this.persist((db) => db.put('docs', this.docs.get(key(entity, id)), key(entity, id)))
      }
      return
    }
    if (!doc || doc.deleted) {
      this.docs.delete(key(entity, id))
      this.persist((db) => db.delete('docs', key(entity, id)))
    } else {
      this.docs.set(key(entity, id), doc)
      this.persist((db) => db.put('docs', doc, key(entity, id)))
    }
    this.bump()
  }
  /** Snapshot: lokale Kopie ersetzen; offene Ops bleiben und werden darüber gelegt. */
  replaceAll(docs: Doc[], cursor: number) {
    this.docs.clear()
    for (const d of docs) if (!d.deleted) this.docs.set(key(d.entity, d.id), d)
    for (const op of this.outbox) {
      const k = key(op.entity, op.id)
      if (op.op === 'upsert' && op.data) {
        const cur = this.docs.get(k)
        this.docs.set(k, { id: op.id, entity: op.entity, rev: cur?.rev ?? 0, updated_at: op.client_updated_at, deleted: false, origin: this.origin, data: op.data } as Doc)
      } else if (op.op === 'delete') this.docs.delete(k)
    }
    this.meta.cursor = cursor
    this.persist(async (db) => {
      const tx = db.transaction('docs', 'readwrite')
      await tx.store.clear()
      for (const [k, d] of this.docs) await tx.store.put(d, k)
      await tx.done
    })
    this.saveMeta()
    this.bump()
  }
  saveMeta() { this.persist((db) => db.put('meta', { ...this.meta }, 'meta')) }
  setMeta(p: Partial<Meta>) { Object.assign(this.meta, p); this.saveMeta(); this.bump() }
  addNotice(n: Notice) {
    this.notices = [n, ...this.notices.filter((x) => !(x.id === n.id && x.entity === n.entity && x.kind === n.kind))].slice(0, 30)
    this.persist((db) => db.put('meta', this.notices, 'notices'))
    this.bump()
  }
  dismissNotice(n: Notice) {
    this.notices = this.notices.filter((x) => x !== n)
    this.persist((db) => db.put('meta', this.notices, 'notices'))
    this.bump()
  }

  // --- Fotos ---
  async addPendingPhoto(photoId: string, blob: Blob) {
    const p: PendingPhoto = { photo_id: photoId, blob, created_at: nowIso() }
    await this.db?.put('pending_photos', p)
    await this.db?.put('photo_cache', blob, `t:${photoId}`)
    this.bump()
  }
  async pendingPhotos(): Promise<PendingPhoto[]> { return this.db ? ((await this.db.getAll('pending_photos')) as PendingPhoto[]) : [] }
  async removePendingPhoto(photoId: string) { await this.db?.delete('pending_photos', photoId); this.bump() }
  async cachedPhoto(photoId: string, thumb: boolean): Promise<Blob | undefined> {
    return (await this.db?.get('photo_cache', `${thumb ? 't' : 'o'}:${photoId}`)) as Blob | undefined
  }
  async cachePhoto(photoId: string, thumb: boolean, blob: Blob) { await this.db?.put('photo_cache', blob, `${thumb ? 't' : 'o'}:${photoId}`) }
  async kvGet<T>(k: string): Promise<T | undefined> { return (await this.db?.get('kv', k)) as T | undefined }
  async kvSet(k: string, v: unknown) { await this.db?.put('kv', v, k) }
  async clearAll() {
    this.docs.clear(); this.outbox = []; this.meta = { cursor: null, lastSyncAt: null }; this.notices = []
    if (this.db) for (const s of ['docs', 'outbox', 'meta', 'pending_photos', 'photo_cache'] as const) await this.db.clear(s)
    this.bump()
  }
}
