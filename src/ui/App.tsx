import { useEffect, useMemo, useRef, useState } from 'react'
import Scene3D from '../three/Scene3D'
import { PixelIcon } from './icons'
import { Dialog as _D, TitleBar } from './kit'
import { BulkDialog, ItemFormDialog, LabelDialog, PopupHost, QuickAddDialog, PlaceSelect } from './dialogs'
import { AwayScreen, InboxScreen, ItemDetail, MachinesScreen, SearchPane, AddPhotoButton } from './screens'
import { CategoriesScreen, ExplorerScreen, LoginBox, PairDialog, SettingsScreen, syncLine } from './screens2'
import { boxFor, createItem, openPlace, storePhoto } from './actions'
import { useCatalog, useMedia, useRepoState, useSearch, useSync } from './hooks'
import { getUI, setUI, toast, useUI, type Screen } from './store'
import { getApp } from './store'
import { isTyping } from './Rows'
import { parseNumber } from '../data/parser'
import { timeDe } from './format'
import type { ItemData } from '../data/types'
void _D

const TABS: [Screen, string, string][] = [
  ['search', 'Suche', 'F1'], ['inbox', 'Eingang', 'F2'], ['away', 'Unterwegs', 'F3'], ['machines', 'Maschinen', 'F4'],
  ['explorer', 'Explorer', 'F5'], ['categories', 'Kategorien', 'F6'], ['settings', 'Einstellungen', 'F7'],
]

function useHotkeys(phone: boolean) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const ui = getUI()
      const fk = /^F([1-7])$/.exec(e.key)
      if (fk && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        if (ui.dialog || ui.popup) return
        setUI({ screen: TABS[Number(fk[1]) - 1][0], phoneMore: null })
        return
      }
      if (ui.dialog || ui.popup || ui.loggedOut) return
      if (e.key === '/' && !isTyping()) {
        e.preventDefault()
        setUI({ screen: 'search', phoneTab: 'search', phoneMore: null, focusSearch: ui.focusSearch + 1 })
        setTimeout(() => document.getElementById('q')?.focus(), 0)
      } else if (e.key === 'Escape') {
        if (ui.clipboard) { setUI({ clipboard: null }); return }
        if (ui.screen === 'search' || phone) {
          if (ui.query || ui.statusFilter || ui.view !== 'list' || ui.selPlace) { setUI({ query: '', statusFilter: null, view: 'list', selItem: null, selPlace: null }); (document.activeElement as HTMLElement | null)?.blur?.() }
        }
      } else if ((e.key === 'n' || e.key === 'N') && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setUI({ dialog: 'quick' })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phone])
}

function useAutoSync() {
  const { engine } = getApp()
  useEffect(() => {
    void engine.sync()
    const t = setInterval(() => { if (navigator.onLine !== false) void engine.sync() }, 60_000)
    const f = () => void engine.sync()
    window.addEventListener('focus', f)
    window.addEventListener('online', f)
    return () => { clearInterval(t); window.removeEventListener('focus', f); window.removeEventListener('online', f) }
  }, [engine])
}

function Dialogs() {
  const ui = useUI()
  return (
    <>
      {ui.dialog === 'quick' && <QuickAddDialog />}
      {ui.dialog === 'item' && <ItemFormDialog />}
      {ui.dialog === 'bulk' && <BulkDialog />}
      {ui.dialog === 'label' && ui.selPlace && <LabelDialog id={ui.selPlace} />}
      <PopupHost />
      {ui.popup?.kind === 'pair' && <PairDialog onClose={() => setUI({ popup: null })} />}
      {ui.toast && <div className="toast" role="status">{ui.toast}</div>}
      {ui.loggedOut && <LoginBox />}
    </>
  )
}

function ScreenBody({ screen, phone }: { screen: Screen; phone?: boolean }) {
  switch (screen) {
    case 'search': return <SearchPane phone={phone} />
    case 'inbox': return <InboxScreen phone={phone} />
    case 'away': return <AwayScreen phone={phone} />
    case 'machines': return <MachinesScreen phone={phone} />
    case 'explorer': return <ExplorerScreen phone={phone} />
    case 'categories': return <CategoriesScreen phone={phone} />
    case 'settings': return <SettingsScreen phone={phone} />
  }
}

export function ScenePane() {
  const ui = useUI()
  const cat = useCatalog()
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const active = !!(ui.query || ui.statusFilter) && ui.screen === 'search'
  const results = useSearch(active ? ui.query : '', active ? ui.statusFilter : null)
  const hits = useMemo(() => {
    const s = new Set<string>()
    if (!active) return s
    for (const r of results) {
      if (r.kind === 'item') { const it = cat.items.get(r.id); const b = it && boxFor(cat.itemPlace(it)); if (b) s.add(b) }
      else if (r.kind === 'place') { const b = boxFor(r.id); if (b) s.add(b) }
      else { const m = cat.machines.get(r.id); const b = m?.data.place_id ? boxFor(m.data.place_id) : null; if (b) s.add(b) }
    }
    return s
  }, [active, results, cat])
  const places = useMemo(() => [...cat.places.values()].filter((p) => p.data.geometry?.size), [cat])
  const repo = useRepoState()
  const layout = repo.layout?.data
  const sel = ui.selPlace && cat.places.get(ui.selPlace)
  const selBox = ui.selPlace ? boxFor(ui.selPlace) : null
  const selBoxDoc = selBox ? cat.places.get(selBox) : null
  const hint = selBoxDoc ? `${selBoxDoc.data.name} · ${selBoxDoc.data.human_id ?? ''}` : active ? `${hits.size} ${hits.size === 1 ? 'Kiste leuchtet' : 'Kisten leuchten'}` : 'Keller · alle Orte'
  void sel
  return (
    <div className="pane">
      <div className="ph"><span>Werkstatt 3D</span><span className="kb">Klick = Kiste öffnen</span></div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <Scene3D places={places} layout={layout} hits={hits} active={active} selected={selBox} onSelect={(id) => openPlace(id)} reducedMotion={reduced} />
        <div className="scene-hint" aria-live="polite">{hint}</div>
      </div>
    </div>
  )
}

export function StatusBar() {
  const s = useSync()
  const repo = useRepoState()
  const cat = useCatalog()
  const app = getApp()
  const l = syncLine(s, repo.notices)
  return (
    <div className="sb">
      <div><span className={`led ${l.led}`} />{l.text}</div>
      <div className="gr">{app.demo ? 'Demo-Modus: Beispieldaten, kein Server' : `Tess: ${new URL(app.serverUrl!, location.href).host}`} · Kopie offline vorhanden</div>
      <div>{cat.items.size} Dinge</div>
      <div className="kb">/ suchen · N neu · F2 Eingang</div>
    </div>
  )
}

function LaptopApp() {
  const ui = useUI()
  const cat = useCatalog()
  const inbox = [...cat.items.values()].filter((i) => cat.effectiveStatus(i) === 'inbox').length
  const away = [...cat.items.values()].filter((i) => i.data.status === 'lent' || i.data.status === 'in_use').length
  const counts: Partial<Record<Screen, number>> = { inbox, away }
  const [full, setFull] = useState(false)
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  const dev = (() => { try { return localStorage.getItem('werkstatt.devicename') } catch { return null } })() ?? 'Keller-Laptop'
  return (
    <div className="win">
      <TitleBar title={<><PixelIcon name="box" size={12} /> WERKSTATT</>}>
        <span className="dev">{dev}</span>
        <span className="wb">
          <span aria-hidden style={{ width: 18, height: 16, display: 'grid', placeItems: 'center', background: 'var(--btn)', color: 'var(--ink)', boxShadow: 'var(--raise)' }}><PixelIcon name="minimize" size={8} /></span>
          <button type="button" aria-label={full ? 'Vollbild beenden' : 'Vollbild'} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => undefined) }}><PixelIcon name="maximize" size={8} /></button>
          <span aria-hidden style={{ width: 18, height: 16, display: 'grid', placeItems: 'center', background: 'var(--btn)', color: 'var(--ink)', boxShadow: 'var(--raise)' }}><PixelIcon name="close" size={8} /></span>
        </span>
      </TitleBar>
      <div className="menu" role="tablist" aria-label="Bereiche">
        {TABS.map(([k, l, f]) => (
          <button type="button" key={k} role="tab" className="tab" aria-selected={ui.screen === k} onClick={() => setUI({ screen: k })}>
            {l}{counts[k] ? <span className="n" aria-label={`${counts[k]} Einträge`}>{counts[k]}</span> : null}<kbd>{f}</kbd>
          </button>
        ))}
        <button type="button" className="btn pri tbtn" onClick={() => setUI({ dialog: 'quick' })}><PixelIcon name="plus" size={10} /> Schnell hinzufügen <kbd>N</kbd></button>
      </div>
      <div className="main">
        <ScenePane />
        <div className="pane" role="tabpanel"><ScreenBody screen={ui.screen} /></div>
      </div>
      <StatusBar />
    </div>
  )
}

// ---------- Handy ----------
const MORE: [Screen, string][] = [['away', 'Unterwegs'], ['machines', 'Maschinen'], ['explorer', 'Explorer'], ['categories', 'Kategorien & Tags'], ['settings', 'Einstellungen']]

function PhoneNew() {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [place, setPlace] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const { repo } = getApp()
  useEffect(() => {
    let url: string | null = null
    if (photo) void repo.cachedPhoto(photo, true).then((b) => { if (b) { url = URL.createObjectURL(b); setPreview(url) } })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [photo, repo])
  const q = qty.trim() ? parseNumber(qty.replace(/^~/, '')) : 1
  const valid = name.trim().length > 0 && Number.isFinite(q)
  const save = () => {
    const d: ItemData = { name: name.trim(), quantity: q }
    if (qty.trim().startsWith('~')) d.quantity_approx = true
    if (photo) d.photo_ids = [photo]
    d.place_id = place
    d.status = place ? 'stored' : 'inbox'
    createItem(d)
    setName(''); setQty(''); setPhoto(null); setPreview(null)
    toast(place ? 'Angelegt' : 'In den Eingang gelegt')
  }
  return (
    <>
      <div className="phead"><h3>Schnell hinzufügen</h3></div>
      <div className="pbody">
        <label className="cam" style={{ display: 'grid' }} aria-label="Foto aufnehmen">
          {preview ? <img src={preview} alt="Aufgenommenes Foto" /> : <span><PixelIcon name="camera" size={28} /><br />Kamera<br />Foto aufnehmen</span>}
          <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setPhoto(await storePhoto(f))
          }} />
        </label>
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="field" placeholder="Name, z. B. Kabelbinder" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field" placeholder="Menge (optional, ~ = ungefähr)" aria-label="Menge" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          <PlaceSelect value={place} onChange={setPlace} inboxLabel="Kein Ort (Eingang)" />
          <div className="muted">Ohne Ort landet es im Eingang.</div>
          <button type="button" className="btn pri" disabled={!valid} onClick={save}>{place ? 'Anlegen' : 'In den Eingang legen'}</button>
        </div>
      </div>
    </>
  )
}

function PhoneApp() {
  const ui = useUI()
  const s = useSync()
  const repo = useRepoState()
  const cat = useCatalog()
  const l = syncLine(s, repo.notices)
  const inbox = [...cat.items.values()].filter((i) => cat.effectiveStatus(i) === 'inbox').length
  const tab = ui.phoneTab
  const more = ui.phoneMore
  const clock = timeDe(new Date().toISOString())
  const detail = tab === 'search' && !more && ui.view === 'detail' && ui.selItem && cat.items.get(ui.selItem)
  const placeDetail = tab === 'search' && !more && ui.view === 'place'
  return (
    <div className="phone-app">
      <div className="pstat"><span>{clock}</span><span><span className={`led ${l.led}`} style={{ marginRight: 6 }} />{l.text.split(' · ')[0]}</span></div>
      {more ? (
        <>
          <div className="phead" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <button type="button" className="btn" onClick={() => setUI({ phoneMore: null })}>‹ Zurück</button><h3>{MORE.find((m) => m[0] === more)?.[1]}</h3>
          </div>
          <div className="pbody"><ScreenBody screen={more} phone /></div>
        </>
      ) : tab === 'search' ? (
        <>
          {detail || placeDetail ? (
            <div className="phead"><button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setUI({ view: 'list', selItem: null, selPlace: null })}>‹ Zurück</button></div>
          ) : (
            <div className="phead" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><h3>Wo ist …?</h3>
              <button type="button" className="btn" onClick={() => setUI({ phoneMore: 'settings' })} aria-label="Mehr">Mehr</button></div>
          )}
          <div className="pbody"><SearchPane phone /></div>
        </>
      ) : tab === 'inbox' ? (
        <>
          <div className="phead"><h3>Eingang</h3><div className="muted">{inbox} Dinge ohne Ort</div></div>
          <div className="pbody"><InboxScreen phone /></div>
        </>
      ) : <PhoneNew />}
      {!more && tab === 'search' && !detail && !placeDetail && (
        <div style={{ padding: '0 8px 6px', display: 'flex', gap: 6, flexWrap: 'wrap', background: 'var(--bg2)' }}>
          {MORE.map(([k, lbl]) => <button type="button" key={k} className="chip" onClick={() => setUI({ phoneMore: k })}>{lbl}</button>)}
        </div>
      )}
      <div className="pnav" role="tablist">
        {([['search', 'Suche', 'search'], ['new', 'Neu', 'plus'], ['inbox', 'Eingang', 'inbox']] as const).map(([k, lbl, ic]) => (
          <button type="button" key={k} role="tab" className="tab" aria-selected={tab === k && !more} onClick={() => setUI({ phoneTab: k, phoneMore: null, view: 'list', selItem: null })}>
            {ic === 'search' ? <span aria-hidden style={{ font: '700 16px var(--mono)' }}>?</span> : <PixelIcon name={ic as 'plus' | 'inbox'} size={14} />}
            <span>{lbl}{k === 'inbox' && inbox ? ` (${inbox})` : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const phone = useMedia('(max-width: 760px)')
  useHotkeys(phone)
  useAutoSync()
  void ItemDetail; void AddPhotoButton; void useRef
  return (
    <>
      {phone ? <PhoneApp /> : <LaptopApp />}
      <Dialogs />
    </>
  )
}
