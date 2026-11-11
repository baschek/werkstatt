import { useEffect, useMemo, useRef } from 'react'
import { PixelIcon } from './icons'
import { IdLabel, KV, Highlight, Badge } from './kit'
import { ItemRow, listKeys } from './Rows'
import { useCatalog, useSearch, usePhotoUrl } from './hooks'
import { boxFor, giveBack, openItem, openPlace, putAway, storePhoto } from './actions'
import { dateDe, qtyText, shortPath, specLabel, specValueText, timeDe, whereAbout, since } from './format'
import { getApp, getUI, setUI, toast, useUI } from './store'
import type { ItemDoc } from '../data/types'

export function PhotoView({ id, big }: { id: string; big?: boolean }) {
  const url = usePhotoUrl(id, !big)
  return <div className="photo">{url ? <img src={url} alt="Foto" /> : <span>Foto wird geholt …</span>}</div>
}

export function AddPhotoButton({ onAdded }: { onAdded: (photoId: string) => void }) {
  return (
    <label className="btn"><PixelIcon name="camera" size={12} /> Foto
      <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        onAdded(await storePhoto(f))
        toast('Foto gespeichert')
        e.target.value = ''
      }} />
    </label>
  )
}

// ---------- Suche ----------
export function SearchPane({ phone }: { phone?: boolean }) {
  const ui = useUI()
  const cat = useCatalog()
  const results = useSearch(ui.query, ui.statusFilter)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ui.focusSearch) input.current?.focus() }, [ui.focusSearch])
  const stateless = ui.view === 'list'
  const loading = false
  return (
    <>
      {!phone && <div className="ph"><span>Suche &amp; Ergebnisse</span><span className="kb">{stateless ? `${results.length} Treffer` : ''}</span></div>}
      {(!phone || stateless) && (
        <>
          <div className="srch">
            <input ref={input} id="q" className="field" type="search" autoComplete="off" spellCheck={false} placeholder="Wo ist … ? (z. B. lipo, kleber)" aria-label="Suche" value={ui.query}
              onChange={(e) => setUI({ query: e.target.value, view: 'list', selItem: null, selPlace: null })}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); document.querySelector<HTMLElement>('.list button.row')?.focus() }
                if (e.key === 'Enter' && results[0]) { const r = results[0]; if (r.kind === 'item') openItem(r.id); else if (r.kind === 'place') openPlace(r.id) }
              }} />
            {!phone && <button type="button" className="btn" onClick={() => setUI({ query: '', statusFilter: null, selItem: null, selPlace: null, view: 'list' })}>Leeren</button>}
          </div>
          <div className="chips" role="group" aria-label="Status">
            <span className="lbl">Status</span>
            {(['stored', 'lent', 'in_use', 'inbox'] as const).map((s) => (
              <button type="button" key={s} className="chip" aria-pressed={ui.statusFilter === s} onClick={() => setUI({ statusFilter: ui.statusFilter === s ? null : s, view: 'list' })}>
                <PixelIcon name={s === 'stored' ? 'stored' : s === 'lent' ? 'lent' : s === 'in_use' ? 'in_use' : 'inbox'} size={11} />
                {{ stored: 'Eingelagert', lent: 'Verliehen', in_use: 'In Nutzung', inbox: 'Eingang' }[s]}
              </button>
            ))}
          </div>
        </>
      )}
      {ui.view === 'detail' && ui.selItem && cat.items.get(ui.selItem) ? <ItemDetail id={ui.selItem} phone={phone} />
        : ui.view === 'place' && ui.selPlace && cat.places.get(ui.selPlace) ? <PlaceDetail id={ui.selPlace} />
        : (
          <div className="list" id="results" onKeyDown={listKeys} aria-live="polite">
            {loading ? <div style={{ padding: 8 }}><div className="muted">Lade aus der Offline-Kopie …</div>{[1, 2, 3, 4].map((i) => <div className="skel" key={i} />)}</div>
              : results.length === 0 ? (
                <div className="empty">{ui.query || ui.statusFilter ? <>Nichts gefunden{ui.query ? <> für „{ui.query}“</> : ''}.<br />Vielleicht ist es noch im Eingang oder unter einem anderen Namen abgelegt.</> : <>Noch nichts erfasst.<br />Mit „Schnell hinzufügen“ geht es los.</>}</div>
              ) : results.map((r) => {
                if (r.kind === 'item') { const it = cat.items.get(r.id)!; return <ItemRow key={r.id} item={it} query={ui.query} selected={ui.selItem === r.id} onOpen={() => openItem(r.id)} /> }
                if (r.kind === 'place') {
                  const p = cat.places.get(r.id)!
                  return (
                    <button type="button" key={r.id} className="row" onClick={() => openPlace(r.id)}>
                      <div className="nm"><Highlight text={p.data.name} query={ui.query} /></div>
                      <div className="qty">{cat.itemsIn(p.id).length} Dinge</div>
                      <div className="path">{p.data.human_id ? <span className="tid">{p.data.human_id}</span> : 'Ort'} {cat.path(p.id)}</div>
                      <div />
                    </button>
                  )
                }
                const m = cat.machines.get(r.id)!
                return (
                  <button type="button" key={r.id} className="row" onClick={() => setUI({ screen: 'machines', machineSel: m.id })}>
                    <div className="nm"><Highlight text={m.data.name} query={ui.query} /></div><div className="qty">Maschine</div>
                    <div className="path">{m.data.model ?? ''}</div><div />
                  </button>
                )
              })}
          </div>
        )}
    </>
  )
}

// ---------- Detail Ding ----------
export function ItemDetail({ id, phone }: { id: string; phone?: boolean }) {
  const cat = useCatalog()
  const it = cat.items.get(id)!
  const d = it.data
  const status = cat.effectiveStatus(it)
  const placeId = cat.itemPlace(it)
  const chain = cat.placeChain(placeId)
  const fields = cat.specFields(d.category_id)
  const specs = Object.entries(d.specs ?? {})
  const photos = d.photo_ids ?? []
  const full = specs.length > 0 || !!d.notes || photos.length > 0
  const machine = d.machine_id ? cat.machines.get(d.machine_id) : undefined
  const w = whereAbout(it)
  const edit = () => setUI({ dialog: 'item', itemForm: { id } })
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (getUI().dialog || getUI().popup || (e.target as HTMLElement)?.matches?.('input,textarea,select')) return
      if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); edit() }
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setUI({ popup: { kind: 'move', ids: [id] } }) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  return (
    <div className="det">
      {!phone && <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setUI({ view: 'list', selItem: null, selPlace: null })}>‹ Zurück zur Liste</button>}
      <div>
        <h2>{d.name}</h2>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge status={status} />{w && <span>{w}{since(it) ? ` seit ${since(it)}` : ''}</span>}
          {machine && <button type="button" className="tag" onClick={() => setUI({ screen: 'machines', machineSel: machine.id })}>{machine.data.name}</button>}
        </div>
      </div>
      {placeId ? (
        <div className="crumb">
          {chain.map((p, i) => (
            <span key={p.id} style={{ display: 'contents' }}>
              {i > 0 && <span>›</span>}
              {i === chain.length - 1 || p.data.geometry ? <button type="button" onClick={() => openPlace(boxFor(p.id) ?? p.id)}>{p.data.name}{p.data.human_id ? ` (${p.data.human_id})` : ''}</button> : <span>{p.data.name}</span>}
            </span>
          ))}
        </div>
      ) : (
        <div className="crumb">
          Noch kein Ort. Bitte einsortieren.
          {!!d.suggested_place_id && cat.places.has(String(d.suggested_place_id)) && <button type="button" onClick={() => openPlace(String(d.suggested_place_id))}>Vorschlag: {shortPath(cat, String(d.suggested_place_id)).replace(/ › /g, '-')}</button>}
        </div>
      )}
      <KV rows={[
        ['Menge', qtyText(it)],
        ['Kategorie', cat.categoryPath(d.category_id) || '–'],
        ...specs.map(([k, v]) => [specLabel(fields, k), specValueText(fields, k, v)] as [string, string]),
      ]} />
      {(d.tags?.length ?? 0) > 0 && <div className="tags">{d.tags!.map((t) => <button type="button" className="tag" key={t} onClick={() => setUI({ screen: 'search', query: t, view: 'list', selItem: null })}>#{t}</button>)}</div>}
      {d.notes && <div><div className="sec">Notiz</div>{d.notes}</div>}
      {photos.length > 0 ? <div className="photos">{photos.map((p) => <PhotoView key={p} id={p} />)}</div>
        : full ? <div className="photo">Kein Foto</div> : <div className="muted">Nur das Nötigste erfasst. Details sind optional.</div>}
      <div className="acts">
        {status === 'inbox' && !!d.suggested_place_id && cat.places.has(String(d.suggested_place_id)) && <button type="button" className="btn pri" onClick={() => { putAway(id, String(d.suggested_place_id)); toast('Abgelegt') }}>Ablegen</button>}
        {full ? <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'consume', id } })}>Verbrauch buchen</button> : null}
        <button type="button" className="btn" onClick={edit}>{full ? 'Bearbeiten' : 'Details hinzufügen'} <kbd>E</kbd></button>
        <AddPhotoButton onAdded={(pid) => getApp().repo.patch('item', id, { photo_ids: [...photos, pid] })} />
        <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'move', ids: [id] } })}>Verschieben <kbd>M</kbd></button>
        {status === 'lent' || status === 'in_use' ? <button type="button" className="btn pri" onClick={() => giveBack(it)}>Zurücklegen</button> : <>
          <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'lend', id } })}>Verleihen</button>
          <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'use', id } })}>In Nutzung</button></>}
      </div>
    </div>
  )
}

// ---------- Detail Ort ----------
export function PlaceDetail({ id }: { id: string }) {
  const cat = useCatalog()
  const p = cat.places.get(id)!
  const items = cat.itemsIn(id)
  const subs = cat.children(id)
  const chain = cat.placeChain(id)
  const photos = p.data.photo_ids ?? []
  return (
    <div className="det">
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setUI({ view: 'list', selPlace: null })}>‹ Zurück zur Liste</button>
      <div>
        <h2>{p.data.name}</h2>
        <div className="crumb" style={{ marginTop: 4 }}>{chain.slice(0, -1).map((c) => c.data.name).join(' › ') || 'Oberste Ebene'}</div>
      </div>
      <IdLabel id={p.data.human_id ?? p.data.name} />
      {p.data.notes && <div>{p.data.notes}</div>}
      {photos.length > 0 && <div className="photos">{photos.map((x) => <PhotoView key={x} id={x} />)}</div>}
      {subs.length > 0 && <div className="tags">{subs.map((s) => <button type="button" className="tag" key={s.id} onClick={() => openPlace(s.id)}>{s.data.human_id ?? s.data.name}</button>)}</div>}
      <div className="sec">Inhalt ({items.length})</div>
      <div className="box" onKeyDown={listKeys}>
        {items.length ? items.map((it) => <ItemRow key={it.id} item={it} onOpen={() => openItem(it.id)} extra={cat.placeChain(cat.itemPlace(it)).slice(chain.length).map((x) => x.data.name).join(' › ') || 'ohne Fach'} />)
          : <div className="empty">Diese Kiste ist leer.</div>}
      </div>
      <div className="acts">
        <button type="button" className="btn pri" onClick={() => setUI({ dialog: 'quick', quickPlace: id })}>Schnell hinzufügen</button>
        <AddPhotoButton onAdded={(pid) => getApp().repo.patch('place', id, { photo_ids: [...photos, pid] })} />
        <button type="button" className="btn" onClick={() => setUI({ dialog: 'label' })}>Etikett drucken</button>
        <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'place', id } })}>Bearbeiten</button>
      </div>
    </div>
  )
}

// ---------- Eingang ----------
export function InboxScreen({ phone }: { phone?: boolean }) {
  const cat = useCatalog()
  const items = useMemo(() => [...cat.items.values()].filter((i) => cat.effectiveStatus(i) === 'inbox').sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [cat])
  const sel = useRef(0)
  const wrap = useRef<HTMLDivElement>(null)
  const from = (i: ItemDoc) => i.origin === 'claude' ? 'von Claude' : `erfasst ${timeDe(i.updated_at)}`
  const sug = (i: ItemDoc) => { const s = i.data.suggested_place_id; return typeof s === 'string' && cat.places.has(s) ? s : null }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (getUI().dialog || getUI().popup || (e.target as HTMLElement)?.matches?.('input,textarea,select')) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const rows = [...(wrap.current?.querySelectorAll<HTMLElement>('tr[data-row]') ?? [])]
        if (!rows.length) return
        e.preventDefault()
        sel.current = Math.max(0, Math.min(rows.length - 1, sel.current + (e.key === 'ArrowDown' ? 1 : -1)))
        rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === sel.current)))
        rows[sel.current].scrollIntoView({ block: 'nearest' })
      }
      if (e.key === 'Enter' && !(e.target as HTMLElement)?.closest?.('button')) {
        const row = wrap.current?.querySelectorAll<HTMLElement>('tr[data-row]')[sel.current]
        row?.querySelector<HTMLButtonElement>('button.pri')?.click()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const doPut = (i: ItemDoc) => {
    const s = sug(i)
    if (!s) { setUI({ popup: { kind: 'move', ids: [i.id] } }); return }
    putAway(i.id, s)
    setUI({ selPlace: boxFor(s) })
    toast(`„${i.data.name}“ abgelegt: ${shortPath(cat, s)}`)
  }
  return (
    <>
      {!phone && <div className="ph"><span>Eingang</span><span className="kb">Ohne Ort, noch wegräumen</span></div>}
      <div className="list" id="results" ref={wrap}>
        {items.length === 0 ? <div className="empty">Der Eingang ist leer. Alles hat einen Platz.</div> : (
          <table className="t">
            <thead><tr><th>Ding</th><th>Vorschlag</th><th /></tr></thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={i.id} data-row aria-selected={n === 0} style={n === 0 ? { background: 'var(--btn)' } : undefined}>
                  <td><b style={{ cursor: 'pointer' }} onClick={() => openItem(i.id)}>{i.data.name}</b><div className="muted">{qtyText(i)} · {from(i)}</div></td>
                  <td className="sug">{sug(i) ? <button type="button" className="btn" onClick={() => openPlace(sug(i)!)}>{shortPath(cat, sug(i)).replace(/ › /g, ' › ')}</button> : <span className="muted">kein Vorschlag</span>}</td>
                  <td className="t-actions"><button type="button" className="btn pri" onClick={() => doPut(i)}>{sug(i) ? 'Ablegen' : 'Ort wählen'} {n === 0 && <kbd>⏎</kbd>}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ---------- Unterwegs ----------
export function AwayScreen({ phone }: { phone?: boolean }) {
  const cat = useCatalog()
  const items = [...cat.items.values()].filter((i) => i.data.status === 'lent' || i.data.status === 'in_use').sort((a, b) => (a.data.status_since ?? '').localeCompare(b.data.status_since ?? ''))
  return (
    <>
      {!phone && <div className="ph"><span>Unterwegs</span><span className="kb">Nicht an ihrem Platz</span></div>}
      <div className="list" id="results">
        {items.length === 0 ? <div className="empty">Nichts unterwegs. Alles liegt an seinem Platz.</div> : (
          <table className="t">
            <thead><tr><th>Ding</th><th>Wo / bei wem</th><th>Seit</th><th /></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.id}>
                <td><b style={{ cursor: 'pointer' }} onClick={() => openItem(i.id)}>{i.data.name}</b><div className="path">gehört: {shortPath(cat, cat.itemPlace(i))}</div></td>
                <td><Badge status={cat.effectiveStatus(i)} /> {whereAbout(i)}</td>
                <td className="sug">{since(i)}</td>
                <td className="t-actions"><button type="button" className="btn" onClick={() => giveBack(i)}>Zurücklegen</button></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </>
  )
}

// ---------- Maschinen ----------
export function MachinesScreen({ phone }: { phone?: boolean }) {
  const ui = useUI()
  const cat = useCatalog()
  const list = [...cat.machines.values()].sort((a, b) => a.data.name.localeCompare(b.data.name, 'de'))
  const sel = list.find((m) => m.id === ui.machineSel) ?? (phone ? undefined : list[0])
  const items = sel ? cat.machineItems(sel.id) : []
  const place = sel?.data.place_id ? cat.places.get(sel.data.place_id) : undefined
  return (
    <>
      {!phone && <div className="ph"><span>Maschinen</span><span className="kb">{list.length} Geräte</span></div>}
      {list.length === 0 ? <div className="empty">Noch keine Maschine.<br /><button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'machine', id: null } })}>Maschine anlegen</button></div> : (
        <div className={phone ? '' : 'two'} style={{ flex: 1, minHeight: 0, ...(phone ? { overflow: 'auto' } : {}) }}>
          {(!phone || !sel) && <div onKeyDown={listKeys}>
            {list.map((m) => (
              <button type="button" className="row" key={m.id} aria-selected={sel?.id === m.id} onClick={() => setUI({ machineSel: m.id })}>
                <div className="nm">{m.data.name}</div><div className="qty">{cat.places.get(m.data.place_id ?? '')?.data.human_id ?? ''}</div><div className="path">{m.data.model ?? ''}</div>
              </button>
            ))}
            <div style={{ padding: 8 }}><button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'machine', id: null } })}>＋ Neue Maschine</button></div>
          </div>}
          {sel && (
            <div className="det">
              {phone && <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setUI({ machineSel: null })}>‹ Zurück</button>}
              <div>
                <h2>{sel.data.name}</h2>
                <div className="crumb" style={{ marginTop: 4 }}>
                  {place ? <>Steht auf: <button type="button" onClick={() => openPlace(place.id)}>{cat.places.get(place.data.parent_id ?? '')?.data.name ?? place.data.name}{place.data.parent_id ? ` (${cat.places.get(place.data.parent_id)?.data.human_id ?? ''})` : ''}</button></> : 'Noch kein Ort'}
                </div>
              </div>
              <KV rows={[...(sel.data.model ? [['Modell', sel.data.model] as [string, string]] : []), ...Object.entries(sel.data.specs ?? {}).map(([k, v]) => [specLabel([], k), specValueText([], k, v)] as [string, string])]} />
              {sel.data.notes && <div><div className="sec">Notiz</div>{sel.data.notes}</div>}
              <div className="sec">Werkzeug &amp; Verbrauch ({items.length})</div>
              <div className="box" onKeyDown={listKeys}>
                {items.length ? items.map((i) => <ItemRow key={i.id} item={i} onOpen={() => openItem(i.id)} />) : <div className="empty">Noch nichts verknüpft. Am Ding unter „Bearbeiten“ → „Gehört zu“.</div>}
              </div>
              <div className="acts">
                <button type="button" className="btn" onClick={() => setUI({ popup: { kind: 'machine', id: sel.id } })}>Bearbeiten</button>
                {place && <button type="button" className="btn" onClick={() => openPlace(place.id)}>Im 3D-Bild zeigen</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export { dateDe }
