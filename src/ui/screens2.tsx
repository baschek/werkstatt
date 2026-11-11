import { useEffect, useMemo, useRef, useState } from 'react'
import { PixelIcon } from './icons'
import { ItemRow, listKeys } from './Rows'
import { useCatalog, useRepoState, useSync } from './hooks'
import { deletePlace, moveItems, movePlaces, openItem, openPlace } from './actions'
import { dateDe, timeDe } from './format'
import { getApp, getUI, setUI, toast, useUI } from './store'
import { configuredServer, demoLoggedOut, envLocked, resetDemo, setDemoLoggedOut, setServerUrl } from '../app'
import { loginWithPasskey, logout, pairDevice, registerPasskey, setSession } from '../data/http'
import type { Notice } from '../data/repo'
import { nowIso } from '../data/id'
import type { ItemData, PlaceDoc } from '../data/types'
import { BackendError } from '../data/types'
import { Dialog, KV } from './kit'

// ---------- Explorer ----------
const MIME = 'application/x-werkstatt'
type Drag = { entity: 'item' | 'place'; ids: string[] }

export function ExplorerScreen({ phone }: { phone?: boolean }) {
  const ui = useUI()
  const cat = useCatalog()
  const [open, setOpen] = useState<Set<string> | null>(null) // null = alle offen
  const [over, setOver] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const lastPicked = useRef<string | null>(null)
  const firstFilled = [...cat.places.values()].find((p) => cat.itemsIn(p.id).length > 0 && p.data.human_id)?.id ?? null
  const selPlace = ui.explorerSel?.entity === 'place' ? ui.explorerSel.id : ui.selPlace && cat.places.has(ui.selPlace) ? ui.selPlace : firstFilled
  const inboxSel = ui.explorerSel?.id === '__inbox'
  const current = inboxSel ? null : selPlace ?? cat.children(null)[0]?.id ?? null
  const items = inboxSel ? [...cat.items.values()].filter((i) => cat.effectiveStatus(i) === 'inbox') : current ? cat.itemsIn(current) : []
  const isOpen = (id: string) => open === null || open.has(id)
  const toggle = (id: string) => {
    const all = open ?? new Set([...cat.places.keys()])
    const n = new Set(all)
    if (n.has(id)) n.delete(id); else n.add(id)
    setOpen(n)
  }
  const cutIds = new Set(ui.clipboard?.ids ?? [])
  const cb = ui.clipboard

  const select = (id: string) => setUI({ explorerSel: { entity: 'place', id }, selPlace: id })
  const cut = (entity: 'item' | 'place', ids: string[]) => { setUI({ clipboard: { entity, ids } }); toast(`${ids.length} ${entity === 'item' ? 'Ding(e)' : 'Ort(e)'} ausgeschnitten. Strg+V auf einem Ort fügt ein.`) }
  const paste = (targetId: string | null) => {
    const c = getUI().clipboard
    if (!c) return
    if (c.entity === 'item') { moveItems(c.ids, targetId); toast('Eingefügt') }
    else if (!movePlaces(c.ids, targetId)) return
    else toast('Eingefügt')
    setUI({ clipboard: null })
  }
  const drop = (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault()
    setOver(null)
    let data: Drag | null = null
    try { data = JSON.parse(e.dataTransfer.getData(MIME)) } catch { /* fremdes Ziehen */ }
    if (!data) return
    if (data.entity === 'item') { moveItems(data.ids, targetId); toast('Verschoben') }
    else if (targetId !== undefined) movePlaces(data.ids, targetId)
  }
  const dragOver = (e: React.DragEvent, id: string) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); setOver(id) } }

  const treeKeys = (e: React.KeyboardEvent, p: PlaceDoc | null) => {
    const nodes = [...(e.currentTarget.closest('[data-tree]')?.querySelectorAll<HTMLElement>('.tn') ?? [])]
    const i = nodes.indexOf(e.currentTarget as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); nodes[i + 1]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nodes[i - 1]?.focus() }
    else if (e.key === 'ArrowRight' && p && cat.children(p.id).length && !isOpen(p.id)) { e.preventDefault(); toggle(p.id) }
    else if (e.key === 'ArrowLeft' && p && isOpen(p.id) && cat.children(p.id).length) { e.preventDefault(); toggle(p.id) }
    else if ((e.key === 'x' || e.key === 'X') && (e.ctrlKey || e.metaKey) && p) { e.preventDefault(); cut('place', [p.id]) }
    else if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); paste(p ? p.id : null) }
    else if (e.key === 'Escape' && getUI().clipboard) { e.stopPropagation(); setUI({ clipboard: null }) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (p) select(p.id); else setUI({ explorerSel: { entity: 'place', id: '__inbox' } }) }
    else if (e.key === 'Delete' && p) setUI({ popup: { kind: 'confirm', text: `Ort „${p.data.name}“ löschen? Inhalt kommt in den Eingang.`, ok: 'Löschen', action: () => deletePlace(p) } })
  }

  const node = (p: PlaceDoc, depth: number): React.ReactNode => {
    const kids = cat.children(p.id)
    const sub = cat.subtreeIds(p.id)
    const count = [...cat.items.values()].filter((i) => sub.has(cat.itemPlace(i) ?? '')).length
    return (
      <div key={p.id}>
        <div className={`tn${over === p.id ? ' over' : ''}${cutIds.has(p.id) ? ' cut' : ''}`} role="treeitem" tabIndex={0} aria-selected={current === p.id && !inboxSel} aria-expanded={kids.length ? isOpen(p.id) : undefined}
          style={{ paddingLeft: 6 + depth * 16 }} draggable data-place={p.id}
          onDragStart={(e) => { e.dataTransfer.setData(MIME, JSON.stringify({ entity: 'place', ids: [p.id] } satisfies Drag)); e.dataTransfer.effectAllowed = 'move' }}
          onDragOver={(e) => dragOver(e, p.id)} onDragLeave={() => setOver((o) => (o === p.id ? null : o))} onDrop={(e) => drop(e, p.id)}
          onClick={() => select(p.id)} onKeyDown={(e) => treeKeys(e, p)}>
          <span className="caret" onClick={(e) => { if (kids.length) { e.stopPropagation(); toggle(p.id) } }}>{kids.length ? <PixelIcon name={isOpen(p.id) ? 'caretDown' : 'caretRight'} size={9} /> : '·'}</span>
          {p.data.human_id && <span className="tid">{p.data.human_id}</span>}<span>{p.data.name}</span><span className="muted">{count}</span>
        </div>
        {kids.length > 0 && isOpen(p.id) && kids.map((k) => node(k, depth + 1))}
      </div>
    )
  }
  const inboxCount = [...cat.items.values()].filter((i) => cat.effectiveStatus(i) === 'inbox').length
  const place = current ? cat.places.get(current) : undefined
  const clickItem = (e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); lastPicked.current = id; return }
    if (e.shiftKey && lastPicked.current) {
      const ids = items.map((i) => i.id)
      const a = ids.indexOf(lastPicked.current), b = ids.indexOf(id)
      setPicked(new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1)))
      return
    }
    setPicked(new Set([id])); lastPicked.current = id
    setUI({ explorerSel: { entity: 'item', id } })
    if (!phone) openItem(id)
  }
  const itemKeys = (e: React.KeyboardEvent) => {
    listKeys(e as never)
    const id = (document.activeElement as HTMLElement | null)?.dataset.item
    if (!id) return
    if ((e.key === 'x' || e.key === 'X') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cut('item', picked.size ? [...new Set([...picked, id])] : [id]) }
    if ((e.key === ' ') ) { e.preventDefault(); const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n) }
    if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setPicked(new Set(items.map((i) => i.id))) }
  }
  return (
    <>
      {!phone && <div className="ph"><span>Explorer</span><span className="kb">{cb ? `Ausgeschnitten: ${cb.ids.length} · Strg+V fügt ein · Esc bricht ab` : 'Ziehen oder Strg+X / Strg+V zum Verschieben'}</span></div>}
      <div className="two" style={phone ? { gridTemplateColumns: '1fr', gridTemplateRows: 'auto 1fr' } : undefined}>
        <div data-tree role="tree" aria-label="Orte">
          {cat.children(null).map((p) => node(p, 0))}
          <div className={`tn${over === '__inbox' ? ' over' : ''}`} role="treeitem" tabIndex={0} aria-selected={inboxSel} style={{ paddingLeft: 6, marginTop: 6, color: inboxSel ? undefined : 'var(--err)' }}
            onDragOver={(e) => dragOver(e, '__inbox')} onDragLeave={() => setOver(null)} onDrop={(e) => { const d = (() => { try { return JSON.parse(e.dataTransfer.getData(MIME)) as Drag } catch { return null } })(); if (d?.entity === 'item') drop(e, null); else { e.preventDefault(); setOver(null); toast('Nur Dinge können in den Eingang') } }}
            onClick={() => setUI({ explorerSel: { entity: 'place', id: '__inbox' } })} onKeyDown={(e) => treeKeys(e, null)}>
            <PixelIcon name="inbox" size={11} /> Eingang <span className="muted">{inboxCount}</span>
          </div>
          <div style={{ padding: 8 }}><button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'place', id: null, parent: current } })}>＋ Neuer Ort</button></div>
        </div>
        <div onKeyDown={itemKeys} data-itemlist>
          <div className="sec" style={{ padding: '8px 8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{inboxSel ? 'Eingang' : place ? `${place.data.human_id ?? ''} · ${place.data.name}` : ''}</span>
            {place && !inboxSel && <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="btn" onClick={() => openPlace(place.id)}>Öffnen</button>
              <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'place', id: place.id } })}>Bearbeiten</button>
              <button type="button" className="btn" onClick={() => setUI({ dialog: 'quick', quickPlace: place.id })}>＋ Dinge</button>
            </span>}
          </div>
          {items.length ? items.map((it) => (
            <div key={it.id} onClick={(e) => clickItem(e, it.id)} style={picked.has(it.id) ? { outline: '2px solid var(--seld)', outlineOffset: -2 } : undefined}>
              <ItemRow item={it} cut={cutIds.has(it.id)} onOpen={() => { /* Klick behandelt der Wrapper */ }}
                dragProps={{ draggable: true, onDragStart: (e: React.DragEvent) => { const ids = picked.has(it.id) ? [...picked] : [it.id]; e.dataTransfer.setData(MIME, JSON.stringify({ entity: 'item', ids } satisfies Drag)); e.dataTransfer.effectAllowed = 'move' } }}
                extra={place ? cat.placeChain(cat.itemPlace(it)).slice(cat.placeChain(place.id).length).map((x) => x.data.name).join(' › ') || 'ohne Fach' : undefined} />
            </div>
          )) : <div className="empty">{inboxSel ? 'Der Eingang ist leer.' : 'Leer. Zieh etwas auf diese Kiste.'}</div>}
        </div>
      </div>
    </>
  )
}

// ---------- Kategorien & Tags ----------
export function CategoriesScreen({ phone }: { phone?: boolean }) {
  const ui = useUI()
  const cat = useCatalog()
  const repo = useRepoState()
  const roots = [...cat.categories.values()].filter((c) => !c.data.parent_id || !cat.categories.has(c.data.parent_id))
  const kids = (id: string) => [...cat.categories.values()].filter((c) => c.data.parent_id === id).sort((a, b) => a.data.name.localeCompare(b.data.name, 'de'))
  const sel = (ui.categorySel && cat.categories.get(ui.categorySel)) || [...cat.categories.values()].find((c) => (c.data.spec_fields?.length ?? 0) > 0) || roots[0]
  const count = (id: string) => { const s = cat.categorySubtreeIds(id); return [...cat.items.values()].filter((i) => s.has(i.data.category_id ?? '')).length }
  const rows: { id: string; d: number }[] = []
  const walk = (id: string, d: number) => { rows.push({ id, d }); kids(id).forEach((k) => walk(k.id, d + 1)) }
  roots.sort((a, b) => a.data.name.localeCompare(b.data.name, 'de')).forEach((r) => walk(r.id, 0))
  const tags = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of [...cat.items.values(), ...cat.places.values()]) for (const t of d.data.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
  }, [cat])
  const fields = sel?.data.spec_fields ?? []
  const move = (i: number, dir: -1 | 1) => {
    if (!sel) return
    const f = [...fields]; const j = i + dir
    if (j < 0 || j >= f.length) return
    ;[f[i], f[j]] = [f[j], f[i]]
    repo.patch('category', sel.id, { spec_fields: f }); getApp().engine.schedule()
  }
  return (
    <>
      {!phone && <div className="ph"><span>Kategorien &amp; Tags</span><span className="kb">{cat.categories.size} Kategorien · {tags.length} Tags</span></div>}
      <div className="two" style={phone ? { gridTemplateColumns: '1fr', gridTemplateRows: 'auto 1fr' } : { gridTemplateColumns: 'minmax(0,.7fr) minmax(0,1.3fr)' }}>
        <div onKeyDown={listKeys}>
          {rows.map(({ id, d }) => {
            const c = cat.categories.get(id)!
            return (
              <div key={id} className="tn" role="button" tabIndex={0} aria-selected={sel?.id === id} style={{ paddingLeft: 6 + d * 16 }} onClick={() => setUI({ categorySel: id })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUI({ categorySel: id }) } }}>
                <span className="caret">{kids(id).length ? <PixelIcon name="caretDown" size={9} /> : '·'}</span>{c.data.name}<span className="muted">{count(id)}</span>
              </div>
            )
          })}
          <div style={{ padding: 8 }}><button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'category', id: null, parent: sel?.id ?? null } })}>＋ Kategorie</button></div>
          <div className="sec" style={{ padding: '8px 8px 4px' }}>Tags</div>
          <div className="tags" style={{ padding: '0 8px 10px' }}>
            {tags.length ? tags.map(([t, n]) => <button type="button" className="tag" key={t} title="Umbenennen, zusammenführen oder entfernen" onClick={() => setUI({ popup: { kind: 'tag', tag: t } })}>#{t} {n}</button>) : <span className="muted">Noch keine Tags.</span>}
          </div>
        </div>
        <div>
          {sel ? (
            <div className="det">
              <div><h2>{sel.data.name}</h2><div className="muted">{cat.categoryPath(sel.id)} · {count(sel.id)} Dinge</div></div>
              {(sel.data.synonyms?.length ?? 0) > 0 && <div><div className="sec">Synonyme für die Suche</div>{sel.data.synonyms!.join(', ')}</div>}
              <div className="sec">Spezifikationsfelder</div>
              {fields.length ? (
                <table className="t box"><thead><tr><th>Feld</th><th>Typ</th><th>Einheit / Werte</th><th>Pflicht</th><th /></tr></thead>
                  <tbody>{fields.map((f, i) => (
                    <tr key={f.key}>
                      <td><b>{f.label}</b></td><td>{{ text: 'Text', number: 'Zahl', date: 'Datum', bool: 'Ja/Nein', choice: 'Auswahl' }[f.type]}</td>
                      <td className="sug">{f.type === 'choice' ? (f.choices ?? []).join(', ') : f.unit ?? ''}</td>
                      <td><PixelIcon name={f.required ? 'checkOn' : 'checkOff'} size={12} title={f.required ? 'Pflicht' : 'optional'} /></td>
                      <td className="t-actions">
                        <button type="button" className="btn" aria-label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>{' '}
                        <button type="button" className="btn" aria-label="Nach unten" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>↓</button>{' '}
                        <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'specfield', categoryId: sel.id, key: f.key } })}>Bearbeiten</button>{' '}
                        <button type="button" className="btn danger" onClick={() => { repo.patch('category', sel.id, { spec_fields: fields.filter((x) => x.key !== f.key) }); getApp().engine.schedule() }}>Entfernen</button>
                      </td>
                    </tr>))}</tbody></table>
              ) : <div className="muted">Keine eigenen Felder. Felder der Oberkategorien gelten trotzdem.</div>}
              <div className="acts">
                <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'specfield', categoryId: sel.id, key: null } })}>＋ Feld</button>
                <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'category', id: sel.id } })}>Bearbeiten</button>
                <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'category', id: null, parent: sel.id } })}>＋ Unterkategorie</button>
                <button type="button" className="btn" onClick={() => setUI({ screen: 'search', query: '', view: 'list' })}>Dinge zeigen</button>
                <button type="button" className="btn danger" onClick={() => setUI({ popup: { kind: 'confirm', text: `Kategorie „${sel.data.name}“ löschen? Dinge behalten sie nicht, Unterkategorien rücken hoch.`, ok: 'Löschen', action: () => {
                  for (const i of cat.items.values()) if (i.data.category_id === sel.id) repo.patch('item', i.id, { category_id: sel.data.parent_id ?? null } as Partial<ItemData>)
                  for (const k of kids(sel.id)) repo.patch('category', k.id, { parent_id: sel.data.parent_id ?? null })
                  repo.remove('category', sel.id); getApp().engine.schedule(); setUI({ categorySel: null })
                } } })}>Löschen</button>
              </div>
            </div>
          ) : <div className="empty">Noch keine Kategorien.</div>}
        </div>
      </div>
    </>
  )
}

// ---------- Einstellungen ----------
export function syncLine(s: ReturnType<typeof useSync>, notices: Notice[]): { led: 'ok' | 'warn' | 'err'; text: string } {
  const conflict = notices.find((n) => n.kind === 'conflict')
  if (s.health === 'auth') return { led: 'err', text: 'Nicht angemeldet · Verbindung verloren' }
  if (s.health === 'error') return { led: 'err', text: 'Sync-Fehler · TESS nicht erreichbar' }
  if (s.health === 'offline') return { led: 'warn', text: s.pending ? `Offline · ${s.pending} ${s.pending === 1 ? 'Änderung wartet' : 'Änderungen warten'}` : 'Offline · alles gesichert' }
  if (conflict) return { led: 'warn', text: `Konflikt bei „${conflict.name}“` }
  if (s.phase === 'syncing') return { led: 'ok', text: 'Synchronisiere …' }
  if (s.pending) return { led: 'warn', text: `${s.pending} ${s.pending === 1 ? 'Änderung wartet' : 'Änderungen warten'} auf Senden` }
  return { led: 'ok', text: s.lastSyncAt ? `Synchron · zuletzt ${timeDe(s.lastSyncAt)}` : 'Noch nicht synchronisiert' }
}

function diffText(a: Record<string, unknown> | null, b: Record<string, unknown> | null): string {
  if (!a || !b) return a ? 'Auf dem Server gelöscht' : 'Hier gelöscht'
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
  return keys.map((k) => `${k}: ${fmt(a[k])} | ${fmt(b[k])}`).join(' · ') || 'gleich'
}
const fmt = (v: unknown) => (v === undefined || v === null ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export function NoticeCard({ n }: { n: Notice }) {
  const { repo, engine } = getApp()
  const phoneLike = matchMedia('(max-width: 760px)').matches
  const me = phoneLike ? 'Handy' : 'Laptop'
  if (n.kind === 'rejected') {
    return (
      <div className="cf err" role="alert"><b>„{n.name}“ wurde abgelehnt.</b><span>{n.reason} Die Änderung wurde verworfen.</span>
        <div className="acts"><button type="button" className="btn" onClick={() => repo.dismissNotice(n)}>Verstanden</button></div></div>
    )
  }
  const other = n.theirsOrigin === 'claude' ? 'Claude' : 'anderes Gerät'
  const restore = (data: ItemData | null) => { if (data) { repo.put(n.entity, n.id, data as never); engine.schedule() } repo.dismissNotice(n) }
  return (
    <div className="cf" role="alert">
      <b>„{n.name}“ wurde an zwei Stellen geändert.</b>
      <span className="diff">{me} | {other}: {diffText(n.mine as never, n.theirs as never)}</span>
      <span className="muted" style={{ color: 'var(--ink)' }}>Behalten wurde: {n.winner === 'mine' ? me : other} (neuere Änderung). {dateDe(n.at)}</span>
      <div className="acts">
        <button type="button" className="btn" onClick={() => (n.winner === 'mine' ? repo.dismissNotice(n) : restore(n.mine as never))}>{me} behalten</button>
        <button type="button" className="btn pri" onClick={() => (n.winner === 'theirs' ? repo.dismissNotice(n) : restore(n.theirs as never))}>{other.charAt(0).toUpperCase() + other.slice(1)} übernehmen</button>
      </div>
    </div>
  )
}

export function SettingsScreen({ phone }: { phone?: boolean }) {
  const app = getApp()
  const repo = useRepoState()
  const s = useSync()
  const ui = useUI()
  const cat = useCatalog()
  const line = syncLine(s, repo.notices)
  const [url, setUrl] = useState(configuredServer() ?? '')
  const [demoState, setDemoState] = useState<'ok' | 'offline' | 'conflict' | 'error'>('ok')
  const mock = app.mock
  const showDemo = (k: typeof demoState) => {
    if (!mock) return
    setDemoState(k)
    mock.offline = k === 'offline'
    mock.failWith = k === 'error' ? new BackendError(500, 'server_error') : null
    if (k === 'conflict') simulateConflict()
    void app.engine.sync()
  }
  const simulateConflict = () => {
    const it = cat.items.get('i-heisskleber')
    if (!it || !mock) return
    mock.serverWrite('item', it.id, { ...it.data, quantity: 30 }, { origin: 'app', at: nowIso() })
    repo.patch('item', it.id, { quantity: 25 }, new Date(Date.now() - 60_000).toISOString())
  }
  const apply = () => { setServerUrl(url || null); location.reload() }
  const doLogout = async () => {
    if (app.demo) { setDemoLoggedOut(true); setUI({ loggedOut: true }); return }
    if (app.serverUrl) await logout(app.serverUrl)
    setSession(null)
    setUI({ loggedOut: true })
  }
  const host = app.serverUrl ? new URL(app.serverUrl, location.href).host : 'Demo-Modus'
  const [device, setDevice] = useState<string | null>(null)
  useEffect(() => { void repo.kvGet<{ name: string }>('device').then((d) => setDevice(d?.name ?? null)) }, [repo, ui.popup])
  return (
    <>
      {!phone && <div className="ph"><span>Einstellungen</span></div>}
      <div className="det">
        <div className="sec">Synchronisierung</div>
        <KV rows={[
          ['Status', <><span className={`led ${line.led}`} /> {line.text}</>],
          ['Server', app.demo ? 'Keiner (Demo-Modus, Beispieldaten im Browser)' : `TESS · ${host}`],
          ['Offline-Kopie', `${cat.items.size} Dinge · ${cat.places.size} Orte · ${s.pendingPhotos} Fotos warten`],
          ['Wartend', `${s.pending} Änderungen`],
          ['Gerät', device ? `${device} (gekoppelt)` : app.demo ? 'Demo' : 'Anmeldung per Passkey'],
        ]} />
        {s.health === 'error' && <div className="cf err" role="alert"><b>TESS antwortet nicht.</b><span>Deine Daten sind lokal sicher. Prüfe, ob der Pi läuft.</span><div className="acts"><button type="button" className="btn pri" onClick={() => { if (mock) { mock.failWith = null; setDemoState('ok') } void app.engine.sync() }}>Erneut versuchen</button></div></div>}
        {s.health === 'auth' && <div className="cf err" role="alert"><b>Nicht angemeldet.</b><span>Die Sitzung ist abgelaufen oder das Gerät wurde gesperrt. Änderungen bleiben lokal.</span><div className="acts"><button type="button" className="btn pri" onClick={() => setUI({ loggedOut: true })}>Anmelden</button></div></div>}
        {repo.notices.map((n, i) => <NoticeCard key={`${n.kind}${n.id}${i}`} n={n} />)}
        {mock && <>
          <div className="sec">Zustand ansehen (nur Demo)</div>
          <div className="chips" style={{ padding: 0 }} role="group" aria-label="Sync-Zustand simulieren">
            {([['ok', 'Synchron'], ['offline', 'Offline'], ['conflict', 'Konflikt'], ['error', 'Fehler']] as const).map(([k, l]) => <button type="button" key={k} className="chip" aria-pressed={demoState === k} onClick={() => showDemo(k)}>{l}</button>)}
          </div>
        </>}
        <div className="acts">
          <button type="button" className="btn" onClick={() => void app.engine.sync()} disabled={s.phase === 'syncing'}>Jetzt synchronisieren</button>
          {!app.demo && <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'pair' } })}>Mit TESS koppeln …</button>}
          <button type="button" className="btn" onClick={() => void doLogout()}>Abmelden</button>
        </div>
        <div className="sec">Server</div>
        <div className="form">
          <label htmlFor="srv">Adresse</label>
          <input id="srv" className="field sm" value={url} disabled={envLocked()} placeholder="https://tess.example.ts.net (leer = Demo-Modus)" onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="acts"><button type="button" className="btn" disabled={envLocked() || url === (configuredServer() ?? '')} onClick={apply}>Übernehmen und neu laden</button>
          {envLocked() && <span className="muted">Fest eingestellt beim Bauen (VITE_TESS_URL).</span>}</div>
        <div className="sec">Daten</div>
        <div className="acts">
          <button type="button" className="btn" onClick={() => setUI({ dialog: 'bulk' })}>Bulk-Import …</button>
          <button type="button" className="btn danger" onClick={() => setUI({ popup: { kind: 'confirm', ok: 'Löschen', text: app.demo ? 'Demo-Daten und lokale Kopie zurücksetzen?' : 'Lokale Kopie löschen? Sie wird neu vom Server geholt. Nicht gesendete Änderungen gehen verloren.', action: () => { void repo.clearAll().then(() => { if (app.demo) resetDemo(); location.reload() }) } } })}>{app.demo ? 'Demo zurücksetzen' : 'Lokale Kopie löschen'}</button>
        </div>
      </div>
    </>
  )
}

// ---------- Anmeldung ----------
export function LoginBox() {
  const app = getApp()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [status, setStatus] = useState('Verbindung zu TESS wird geprüft …')
  const [pairing, setPairing] = useState(false)
  useEffect(() => {
    if (app.demo) { setStatus('Demo-Modus: keine echte Anmeldung nötig.'); return }
    fetch(`${app.serverUrl!.replace(/\/+$/, '')}/werkstatt/v1/webauthn/login/options`, { method: 'OPTIONS' }).then(() => setStatus('TESS ist erreichbar.')).catch(() => setStatus('TESS ist nicht erreichbar. Die Offline-Kopie bleibt nutzbar, sobald du angemeldet warst.'))
  }, [app])
  const done = () => { setDemoLoggedOut(false); setUI({ loggedOut: false }); void app.engine.sync() }
  const go = async () => {
    setErr(null)
    if (app.demo) { done(); return }
    setBusy(true)
    try { await loginWithPasskey(app.serverUrl!); done() } catch (e) {
      setErr(e instanceof BackendError && e.status === 0 ? 'Keine Verbindung zu TESS.' : 'Anmeldung nicht möglich. Passkey für diese Seite eingerichtet?')
    } finally { setBusy(false) }
  }
  return (
    <div className="login">
      <div className="lbox" role="dialog" aria-label="Anmelden">
        <div className="tbar"><span>▣ WERKSTATT</span></div>
        <div className="body">
          <div className="fp"><PixelIcon name="fingerprint" size={36} /></div>
          <div><b>Anmelden</b><div className="muted">Mit Fingerabdruck, Gesicht oder Passkey vom Handy.</div></div>
          <button type="button" className="btn pri" style={{ minHeight: 36 }} onClick={() => void go()} disabled={busy} data-autofocus>Mit Passkey anmelden</button>
          {err && <div className="err-text" role="alert">{err}</div>}
          {!app.demo && <button type="button" className="btn" onClick={() => setPairing(true)}>Passkey oder Gerät einrichten …</button>}
          <div className="muted">{status}</div>
        </div>
      </div>
      {pairing && <PairDialog onClose={() => setPairing(false)} onDone={done} />}
    </div>
  )
}

export function PairDialog({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const app = getApp()
  const [code, setCode] = useState('')
  const [name, setName] = useState(matchMedia('(max-width: 760px)').matches ? 'Handy' : 'Keller-Laptop')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (kind: 'device' | 'passkey') => {
    if (!app.serverUrl) return
    setBusy(true); setErr(null)
    try {
      if (kind === 'device') { const d = await pairDevice(app.serverUrl, code.trim(), name.trim() || 'Gerät'); await app.repo.kvSet('device', d); toast('Gerät gekoppelt') }
      else { await registerPasskey(app.serverUrl, code.trim(), name.trim() || 'Passkey'); await loginWithPasskey(app.serverUrl); toast('Passkey eingerichtet') }
      onDone?.(); onClose(); setUI({ popup: null }); void app.engine.sync()
    } catch { setErr('Das hat nicht geklappt. Code richtig und noch gültig (10 Minuten)?') } finally { setBusy(false) }
  }
  return (
    <Dialog title="Mit TESS koppeln" onClose={onClose}>
      <div className="body">
        <div className="muted">Auf dem Pi einen Code erzeugen: <span className="mono">./tessctl werkstatt-pair</span> (Gerät) oder <span className="mono">./tessctl werkstatt-passkey-code</span> (Passkey).</div>
        <div className="form">
          <label htmlFor="pcode">Code</label><input id="pcode" className="field" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" spellCheck={false} data-autofocus />
          <label htmlFor="pname">Name</label><input id="pname" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {err && <div className="err-text" role="alert">{err}</div>}
        <div className="foot"><button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <span style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn" disabled={busy || !code.trim()} onClick={() => void run('passkey')}>Passkey einrichten</button>
            <button type="button" className="btn pri" disabled={busy || !code.trim()} onClick={() => void run('device')}>Gerät koppeln</button></span></div>
      </div>
    </Dialog>
  )
}
export { demoLoggedOut }
