// MockBackend: simuliert den TESS-Server nach docs/werkstatt-sync-protocol.md (rev, Tombstones, Konflikte, 410, Idempotenz).
// Für den Demo-Modus (ohne VITE_TESS_URL) und für die Tests.
import { nowIso, uuid } from './id'
import { SEED_DOCS } from './seed'
import {
  BackendError, type AnyData, type Backend, type ChangesResponse, type Doc, type Entity, type Op, type OpResult, type Origin,
  type PhotoMeta, type PushResponse, type SnapshotResponse, type StatusResponse,
} from './types'

const ENTITIES: Entity[] = ['place', 'item', 'category', 'machine', 'layout']
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const k = (e: string, id: string) => `${e}:${id}`
const iso = (d: Date) => d.toISOString()

export interface MockState { rev: number; purgedRev: number; docs: Doc[]; results: [string, OpResult][] }

export class MockBackend implements Backend {
  readonly kind = 'mock' as const
  docs = new Map<string, Doc>()
  rev = 0
  purgedRev = 0
  results = new Map<string, OpResult>()
  photos = new Map<string, Blob>()
  /** Netz weg: jede Anfrage schlägt mit Status 0 fehl. */
  offline = false
  /** Nächste Anfragen mit diesem Fehler beantworten (z. B. 500 oder 404). */
  failWith: BackendError | null = null
  calls: string[] = []
  onChange?: () => void

  constructor(seed: Doc[] = SEED_DOCS, state?: MockState) {
    if (state) {
      this.rev = state.rev; this.purgedRev = state.purgedRev
      for (const d of state.docs) this.docs.set(k(d.entity, d.id), d)
      this.results = new Map(state.results)
    } else {
      for (const d of seed) { this.docs.set(k(d.entity, d.id), structuredClone(d)); this.rev = Math.max(this.rev, d.rev) }
    }
  }
  dump(): MockState { return { rev: this.rev, purgedRev: this.purgedRev, docs: [...this.docs.values()], results: [...this.results.entries()].slice(-300) } }

  private guard(name: string) {
    this.calls.push(name)
    if (this.offline) throw new BackendError(0, 'network')
    if (this.failWith) throw this.failWith
  }
  private live(entity: Entity, id: string) { const d = this.docs.get(k(entity, id)); return d && !d.deleted ? d : undefined }

  async status(): Promise<StatusResponse> {
    this.guard('status')
    const documents: Record<string, number> = {}
    for (const d of this.docs.values()) if (!d.deleted) documents[d.entity] = (documents[d.entity] ?? 0) + 1
    return { rev: this.rev, server_time: nowIso(), documents, photos: this.photos.size }
  }
  async snapshot(): Promise<SnapshotResponse> {
    this.guard('snapshot')
    return { rev: this.rev, documents: structuredClone([...this.docs.values()].filter((d) => !d.deleted).sort((a, b) => a.rev - b.rev)) }
  }
  async changes(since: number, limit = 500): Promise<ChangesResponse> {
    this.guard('changes')
    if (since > this.rev || since < this.purgedRev) throw new BackendError(410, 'resync_required')
    const rows = [...this.docs.values()].filter((d) => d.rev > since).sort((a, b) => a.rev - b.rev)
    const docs = structuredClone(rows.slice(0, limit))
    return { changes: docs, next_since: docs.length ? docs[docs.length - 1].rev : since, has_more: rows.length > limit }
  }

  /** Schreibt wie ein anderer Client (Claude, Handy). */
  serverWrite(entity: Entity, id: string, data: AnyData | null, opts: { origin?: Origin; at?: string } = {}): Doc {
    const cur = this.docs.get(k(entity, id))
    const doc: Doc = {
      id, entity, rev: ++this.rev, updated_at: opts.at ?? nowIso(), deleted: data === null, origin: opts.origin ?? 'claude',
      data: (data ?? {}) as never,
    }
    if (cur && data !== null && !cur.deleted) doc.data = data as never
    this.docs.set(k(entity, id), doc)
    this.onChange?.()
    return structuredClone(doc)
  }
  /** Simuliert, dass der Server alte Tombstones gelöscht hat: Clients mit älterem Cursor bekommen 410. */
  purgeBefore(rev: number) { this.purgedRev = rev }

  private structureError(op: Op): string | null {
    const data = op.data as Record<string, unknown> | undefined
    if (op.op !== 'upsert' || !data) return null
    if (op.entity === 'place' || op.entity === 'category') {
      const parent = data.parent_id as string | null | undefined
      let cur = parent
      const seen = new Set<string>([op.id])
      while (cur) {
        if (seen.has(cur)) return 'cycle'
        seen.add(cur)
        cur = (this.live(op.entity, cur)?.data as Record<string, unknown> | undefined)?.parent_id as string | undefined
      }
    }
    if (op.entity === 'place' && typeof data.human_id === 'string' && data.human_id) {
      const want = data.human_id.toLowerCase()
      for (const d of this.docs.values()) {
        if (d.entity === 'place' && !d.deleted && d.id !== op.id && String((d.data as Record<string, unknown>).human_id ?? '').toLowerCase() === want) return 'human_id_taken'
      }
    }
    return null
  }

  async push(ops: Op[]): Promise<PushResponse> {
    this.guard('push')
    if (ops.length > 200) throw new BackendError(400, 'too_many_ops')
    const results: OpResult[] = []
    for (const op of ops) {
      const stored = op && this.results.get(op.op_id)
      if (stored) { results.push(structuredClone(stored)); continue }
      const r = this.process(op)
      if (op?.op_id) this.results.set(op.op_id, r)
      results.push(structuredClone(r))
    }
    this.onChange?.()
    return { results, rev: this.rev }
  }

  private process(op: Op): OpResult {
    const opId = op.op_id ?? null
    const rej = (reason: string): OpResult => ({ op_id: opId, status: 'rejected', document: this.docs.get(k(op.entity, op.id)) ?? null, reason })
    if (!ENTITIES.includes(op.entity)) return rej('unknown_entity')
    if (!ID_RE.test(op.id ?? '') || (op.op !== 'upsert' && op.op !== 'delete')) return rej('invalid_field')
    if (op.entity === 'layout' && op.id !== 'main') return rej('invalid_field')
    if (op.base_rev !== null && (!Number.isInteger(op.base_rev) || op.base_rev < 0)) return rej('invalid_field')
    if (op.op === 'upsert' && (typeof op.data !== 'object' || op.data === null || typeof (op.data as { name?: unknown }).name !== 'string' && op.entity !== 'layout')) return rej('invalid_field')
    const cur = this.docs.get(k(op.entity, op.id))
    const now = new Date()
    let ts = new Date(op.client_updated_at ?? now)
    if (ts.getTime() > now.getTime() + 5 * 60_000) ts = now
    const deleting = op.op === 'delete'
    const err = this.structureError(op)
    if (err) return rej(err)
    const write = (): Doc => {
      const doc: Doc = { id: op.id, entity: op.entity, rev: ++this.rev, updated_at: iso(ts), deleted: deleting, origin: 'app', data: (deleting ? {} : op.data) as never }
      this.docs.set(k(op.entity, op.id), doc)
      return doc
    }
    if (!cur) return deleting ? { op_id: opId, status: 'applied', document: null } : { op_id: opId, status: 'applied', document: write() }
    if (deleting && cur.deleted) return { op_id: opId, status: 'applied', document: cur }
    if (op.base_rev !== null && op.base_rev > cur.rev) return rej('invalid_field')
    if (op.base_rev === cur.rev) return { op_id: opId, status: 'applied', document: write() }
    // veraltete Basis: neuerer Zeitstempel gewinnt, bei Gleichstand der Server
    if (ts.getTime() > new Date(cur.updated_at).getTime()) return { op_id: opId, status: 'conflict', document: write() }
    return { op_id: opId, status: 'conflict', document: cur }
  }

  async putPhoto(photoId: string, blob: Blob): Promise<PhotoMeta> {
    this.guard('putPhoto')
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(photoId)) throw new BackendError(400, 'invalid_request')
    const had = this.photos.has(photoId)
    if (had && this.photos.get(photoId)!.size !== blob.size) throw new BackendError(409, 'photo_id_taken')
    this.photos.set(photoId, blob)
    return { photo_id: photoId, mime: blob.type || 'image/jpeg', bytes: blob.size, sha256: uuid().replace(/-/g, ''), width: 0, height: 0, has_thumb: true, created: !had, created_at: nowIso() }
  }
  async getPhoto(photoId: string): Promise<Blob | null> {
    this.guard('getPhoto')
    return this.photos.get(photoId) ?? null
  }
}
