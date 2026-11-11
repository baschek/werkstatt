import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { MockBackend } from '../src/data/mock'
import { Repo } from '../src/data/repo'
import { SyncEngine } from '../src/data/sync'
import { BackendError, type ItemData } from '../src/data/types'
import { SEED_DOCS } from '../src/data/seed'

let n = 0
async function setup() {
  const backend = new MockBackend(SEED_DOCS)
  const repo = await Repo.open('t' + n++)
  const engine = new SyncEngine(repo, backend)
  return { backend, repo, engine }
}
const kleber = 'i-heisskleber'

describe('Sync-Motor gegen MockBackend', () => {
  let s: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => { s = await setup() })

  it('erster Lauf holt den Snapshot', async () => {
    await s.engine.sync()
    expect(s.repo.catalog.items.size).toBeGreaterThan(10)
    expect(s.repo.meta.cursor).toBe(s.backend.rev)
    expect(s.engine.state.health).toBe('ok')
    expect(s.engine.state.lastSyncAt).toBeTruthy()
  })

  it('lokale Änderung geht in die Outbox und wird gesendet', async () => {
    await s.engine.sync()
    s.repo.patch('item', kleber, { quantity: 25 })
    expect(s.repo.pendingCount).toBe(1)
    expect(s.repo.get('item', kleber)!.data.quantity).toBe(25)
    await s.engine.sync()
    expect(s.repo.pendingCount).toBe(0)
    expect((s.backend.docs.get(`item:${kleber}`)!.data as ItemData).quantity).toBe(25)
    expect(s.repo.get('item', kleber)!.rev).toBe(s.backend.docs.get(`item:${kleber}`)!.rev)
  })

  it('mehrere Änderungen am selben Dokument werden zusammengefasst', async () => {
    await s.engine.sync()
    s.repo.patch('item', kleber, { quantity: 1 })
    s.repo.patch('item', kleber, { quantity: 2 })
    s.repo.patch('item', kleber, { quantity: 3 })
    expect(s.repo.pendingCount).toBe(1)
    await s.engine.sync()
    expect((s.backend.docs.get(`item:${kleber}`)!.data as ItemData).quantity).toBe(3)
  })

  it('neues Ding und Löschen', async () => {
    await s.engine.sync()
    s.repo.put('item', 'i-neu', { name: 'Testding' })
    await s.engine.sync()
    expect(s.backend.docs.get('item:i-neu')!.data).toMatchObject({ name: 'Testding' })
    s.repo.remove('item', 'i-neu')
    await s.engine.sync()
    expect(s.backend.docs.get('item:i-neu')!.deleted).toBe(true)
    expect(s.repo.get('item', 'i-neu')).toBeUndefined()
  })

  it('offline: App bleibt nutzbar, Outbox wächst, danach wird nachgeholt', async () => {
    await s.engine.sync()
    s.backend.offline = true
    s.repo.patch('item', kleber, { quantity: 7 })
    s.repo.put('item', 'i-offline', { name: 'Offline angelegt' })
    await s.engine.sync()
    expect(s.engine.state.health).toBe('offline')
    expect(s.repo.pendingCount).toBe(2)
    expect(s.repo.catalog.items.has('i-offline')).toBe(true)
    s.backend.offline = false
    await s.engine.sync()
    expect(s.engine.state.health).toBe('ok')
    expect(s.repo.pendingCount).toBe(0)
    expect(s.backend.docs.has('item:i-offline')).toBe(true)
  })

  it('Wiederholung nach Netzfehler ist idempotent (gleiche op_id)', async () => {
    await s.engine.sync()
    s.repo.put('item', 'i-dup', { name: 'Doppelt' })
    const opId = s.repo.outbox[0].op_id
    // Server wendet an, aber die Antwort geht verloren
    await s.backend.push([{ ...s.repo.outbox[0] }])
    const revAfter = s.backend.rev
    s.backend.offline = true
    await s.engine.sync()
    s.backend.offline = false
    await s.engine.sync()
    expect(s.backend.rev).toBe(revAfter)
    expect(s.repo.pendingCount).toBe(0)
    expect(s.backend.results.has(opId)).toBe(true)
  })

  it('Konflikt: Server neuer, Server gewinnt, Hinweis entsteht', async () => {
    await s.engine.sync()
    const old = s.repo.get('item', kleber)!
    s.repo.patch('item', kleber, { quantity: 25 }, new Date(Date.now() - 60_000).toISOString())
    s.backend.serverWrite('item', kleber, { ...old.data, quantity: 30 }, { origin: 'app' })
    await s.engine.sync()
    expect(s.repo.get('item', kleber)!.data.quantity).toBe(30)
    const n = s.repo.notices[0]
    expect(n).toMatchObject({ kind: 'conflict', winner: 'theirs', id: kleber })
    expect(s.repo.pendingCount).toBe(0)
  })

  it('Konflikt: meine Änderung neuer, meine gewinnt', async () => {
    await s.engine.sync()
    const old = s.repo.get('item', kleber)!
    s.backend.serverWrite('item', kleber, { ...old.data, quantity: 30 }, { at: new Date(Date.now() - 120_000).toISOString() })
    s.repo.patch('item', kleber, { quantity: 25 })
    await s.engine.sync()
    expect(s.repo.get('item', kleber)!.data.quantity).toBe(25)
    expect(s.repo.notices[0]).toMatchObject({ kind: 'conflict', winner: 'mine' })
  })

  it('abgelehnt (Kistencode doppelt): Op fällt weg, Hinweis mit Grund', async () => {
    await s.engine.sync()
    s.repo.put('place', 'p-dup', { name: 'Doppelt', human_id: 'r2-k1' })
    await s.engine.sync()
    expect(s.repo.pendingCount).toBe(0)
    expect(s.repo.get('place', 'p-dup')).toBeUndefined()
    expect(s.repo.notices[0]).toMatchObject({ kind: 'rejected', reason: expect.stringContaining('Kistencode') })
  })

  it('Pull übernimmt fremde Änderungen und Löschungen', async () => {
    await s.engine.sync()
    s.backend.serverWrite('item', 'i-claude', { name: 'Von Claude' })
    s.backend.serverWrite('item', kleber, null)
    await s.engine.sync()
    expect(s.repo.get('item', 'i-claude')!.data.name).toBe('Von Claude')
    expect(s.repo.get('item', kleber)).toBeUndefined()
  })

  it('410: Snapshot ersetzt die Kopie, offene Ops bleiben', async () => {
    await s.engine.sync()
    s.backend.offline = true
    s.repo.patch('item', 'i-multimeter', { notes: 'neu' })
    await s.engine.sync()
    s.backend.offline = false
    s.backend.serverWrite('item', 'i-claude', { name: 'Neu am Server' })
    s.backend.purgeBefore(s.backend.rev)
    s.repo.meta.cursor = 1 // zu alt
    await s.engine.sync()
    expect(s.backend.calls).toContain('snapshot')
    expect(s.repo.meta.cursor).toBe(s.backend.rev)
    expect(s.repo.get('item', 'i-claude')).toBeDefined()
    expect(s.repo.pendingCount).toBe(0) // Op wurde danach gesendet
    expect((s.backend.docs.get('item:i-multimeter')!.data as ItemData).notes).toBe('neu')
  })

  it('410 auch wenn der Cursor größer als die Server-rev ist', async () => {
    await s.engine.sync()
    s.repo.meta.cursor = s.backend.rev + 50
    await s.engine.sync()
    expect(s.repo.meta.cursor).toBe(s.backend.rev)
  })

  it('Server-Fehler und Login verloren werden unterschieden', async () => {
    await s.engine.sync()
    s.backend.failWith = new BackendError(500, 'server_error')
    await s.engine.sync()
    expect(s.engine.state.health).toBe('error')
    s.backend.failWith = new BackendError(404, 'not_found')
    await s.engine.sync()
    expect(s.engine.state.health).toBe('auth')
    s.backend.failWith = null
    await s.engine.sync()
    expect(s.engine.state.health).toBe('ok')
  })

  it('Fotos werden mit eigener ID nachgeladen, sobald online', async () => {
    await s.engine.sync()
    s.backend.offline = true
    await s.repo.addPendingPhoto('ph-1', new Blob(['abc'], { type: 'image/jpeg' }))
    await s.engine.sync()
    expect(s.backend.photos.size).toBe(0)
    s.backend.offline = false
    await s.engine.sync()
    expect(s.backend.photos.has('ph-1')).toBe(true)
    expect((await s.repo.pendingPhotos()).length).toBe(0)
  })

  it('Änderungen überleben einen Neustart (IndexedDB)', async () => {
    await s.engine.sync()
    s.backend.offline = true
    s.repo.patch('item', kleber, { quantity: 99 })
    await s.repo.idle()
    const again = await Repo.open('t' + (n - 1))
    expect(again.get('item', kleber)!.data.quantity).toBe(99)
    expect(again.pendingCount).toBe(1)
  })
})
