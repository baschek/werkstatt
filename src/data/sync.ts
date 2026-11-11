// Sync-Motor: Outbox senden → Fotos hochladen → Änderungen holen (bei 410: Snapshot). Nach docs/werkstatt-sync-protocol.md.
import { nowIso } from './id'
import type { Repo } from './repo'
import { BackendError, type Backend, type Doc, type Op, type OpResult } from './types'

export type SyncPhase = 'idle' | 'syncing'
export type SyncHealth = 'ok' | 'offline' | 'error' | 'auth'
export interface SyncState {
  phase: SyncPhase
  health: SyncHealth
  lastError: string | null
  lastSyncAt: string | null
  pending: number
  pendingPhotos: number
}

export const REASONS: Record<string, string> = {
  unknown_entity: 'Unbekannte Art von Eintrag.',
  invalid_field: 'Ein Feld hat einen ungültigen Wert.',
  too_large: 'Der Eintrag ist zu groß.',
  cycle: 'Ein Ort oder eine Kategorie würde in sich selbst liegen.',
  human_id_taken: 'Dieser Kistencode ist schon vergeben.',
}

const BATCH = 200
const PULL_LIMIT = 500

export function opName(op: Op, doc?: Doc | null): string {
  const d = (op.data ?? doc?.data) as { name?: string } | undefined
  return d?.name ?? op.id
}

export class SyncEngine {
  state: SyncState = { phase: 'idle', health: 'ok', lastError: null, lastSyncAt: null, pending: 0, pendingPhotos: 0 }
  private listeners = new Set<() => void>()
  private running: Promise<void> | null = null
  private again = false
  private timer?: ReturnType<typeof setTimeout>

  constructor(public repo: Repo, public backend: Backend) {
    this.state.lastSyncAt = repo.meta.lastSyncAt
    this.state.pending = repo.pendingCount
  }

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  getState = () => this.state
  private set(p: Partial<SyncState>) { this.state = { ...this.state, ...p }; this.listeners.forEach((l) => l()) }
  setBackend(b: Backend) { this.backend = b }

  /** Nach einer Änderung: kurz bündeln, dann senden. */
  schedule(ms = 600) {
    this.set({ pending: this.repo.pendingCount })
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.sync() }, ms)
  }

  sync(): Promise<void> {
    if (this.running) { this.again = true; return this.running }
    this.running = (async () => {
      do {
        this.again = false
        await this.once()
      } while (this.again)
    })().finally(() => { this.running = null })
    return this.running
  }

  private async once() {
    this.set({ phase: 'syncing' })
    try {
      await this.push()
      await this.uploadPhotos()
      await this.pull()
      const at = nowIso()
      this.repo.setMeta({ lastSyncAt: at })
      this.set({ health: 'ok', lastError: null, lastSyncAt: at })
    } catch (e) {
      const err = e instanceof BackendError ? e : new BackendError(-1, String(e))
      if (err.offline) this.set({ health: 'offline', lastError: 'Offline' })
      else if (err.authLost) this.set({ health: 'auth', lastError: 'Nicht angemeldet oder Verbindung verloren' })
      else this.set({ health: 'error', lastError: err.status === 429 ? 'Zu viele Anfragen, später wieder' : `Server-Fehler ${err.code}` })
    } finally {
      this.set({ phase: 'idle', pending: this.repo.pendingCount })
      void this.repo.pendingPhotos().then((p) => this.set({ pendingPhotos: p.length }))
    }
  }

  /** Eine Op pro Dokument je Runde (Folge-Ops brauchen die neue rev). */
  private async push() {
    for (let guard = 0; guard < 50; guard++) {
      const seen = new Set<string>()
      const batch: Op[] = []
      for (const op of this.repo.outbox) {
        const key = `${op.entity}:${op.id}`
        if (seen.has(key) || op.base_rev === -1) { seen.add(key); continue }
        seen.add(key)
        batch.push(op)
        if (batch.length >= BATCH) break
      }
      if (!batch.length) return
      for (const op of batch) this.repo.inflight.add(op.op_id)
      let res
      try {
        res = await this.backend.push(batch.map(({ op_id, entity, id, op, base_rev, client_updated_at, data }) => ({ op_id, entity, id, op, base_rev, client_updated_at, ...(op === 'upsert' ? { data } : {}) })))
      } catch (e) {
        for (const op of batch) this.repo.inflight.delete(op.op_id)
        throw e
      }
      const byId = new Map(res.results.map((r) => [r.op_id, r]))
      for (const op of batch) this.apply(op, byId.get(op.op_id))
    }
  }

  private apply(op: Op, r: OpResult | undefined) {
    if (!r) { this.repo.inflight.delete(op.op_id); return }
    const local = this.repo.get(op.entity, op.id)
    const name = opName(op, local) // Name vor dem Ersetzen merken
    if (r.status === 'applied') {
      this.repo.finishOp(op, r.document, 'replace')
    } else if (r.status === 'conflict') {
      const theirs = r.document
      const iWon = !!theirs && !theirs.deleted && op.op === 'upsert' && sameJson(theirs.data, op.data)
      const iDeleted = op.op === 'delete' && (!theirs || theirs.deleted)
      this.repo.finishOp(op, theirs, 'replace')
      if (!iDeleted) {
        this.repo.addNotice({
          kind: 'conflict', id: op.id, entity: op.entity, name, at: nowIso(), winner: iWon ? 'mine' : 'theirs',
          mine: op.op === 'upsert' ? (op.data ?? null) : null, theirs: theirs && !theirs.deleted ? theirs.data : null, theirsOrigin: theirs?.origin,
        })
      }
    } else {
      // abgelehnt: Op verwerfen, lokal zurück auf den Serverstand
      this.repo.finishOp(op, r.document, 'replace')
      if (!r.document) this.repo.setServerDoc(op.entity, op.id, null, false)
      this.repo.addNotice({ kind: 'rejected', id: op.id, entity: op.entity, name, reason: REASONS[r.reason ?? ''] ?? r.reason ?? 'Abgelehnt', at: nowIso() })
    }
  }

  private async uploadPhotos() {
    for (const p of await this.repo.pendingPhotos()) {
      try {
        await this.backend.putPhoto(p.photo_id, p.blob)
        await this.repo.removePendingPhoto(p.photo_id)
      } catch (e) {
        if (e instanceof BackendError && (e.status === 409 || e.status === 415 || e.status === 400 || e.status === 413)) {
          await this.repo.removePendingPhoto(p.photo_id) // dauerhaft abgelehnt
          continue
        }
        throw e
      }
    }
  }

  private async pull() {
    const cursor = this.repo.meta.cursor
    if (cursor === null) return this.snapshot()
    let since = cursor
    try {
      for (;;) {
        const r = await this.backend.changes(since, PULL_LIMIT)
        for (const d of r.changes) this.repo.setServerDoc(d.entity, d.id, d)
        since = r.next_since
        this.repo.setMeta({ cursor: since })
        if (!r.has_more) break
      }
    } catch (e) {
      if (e instanceof BackendError && e.resync) return this.snapshot()
      throw e
    }
  }

  private async snapshot() {
    const s = await this.backend.snapshot()
    this.repo.replaceAll(s.documents, s.rev)
  }
}

function sameJson(a: unknown, b: unknown) { return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b)) }
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sortKeys(x)]))
  return v
}
