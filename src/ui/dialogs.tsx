import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Catalog } from '../data/catalog'
import { parseQuickAdd } from '../data/parser'
import { parseBulk, rowToItem } from '../data/bulk'
import { nowIso, uuid } from '../data/id'
import type { CategoryData, ItemData, MachineData, PlaceData, PlaceKind, SpecField, SpecType, SpecValue } from '../data/types'
import { createItem, createItemsFromText, moveItems, patchItem, saveItem, storePhoto, deleteItem, setStatus, giveBack } from './actions'
import { Dialog } from './kit'
import { useCatalog } from './hooks'
import { qtyText, shortPath, humanKey } from './format'
import { getApp, getUI, setUI, toast, type Popup } from './store'
import { PixelIcon } from './icons'

// --- Auswahl eines Ortes ---
export function placeOptions(cat: Catalog) {
  const out: { id: string; label: string }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const p of cat.children(parent)) {
      out.push({ id: p.id, label: `${' '.repeat(depth)}${p.data.human_id ? p.data.human_id + ' · ' : ''}${p.data.name}` })
      walk(p.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
export function PlaceSelect({ value, onChange, inboxLabel = 'Eingang (kein Ort)', id, exclude }: { value: string | null; onChange: (v: string | null) => void; inboxLabel?: string | null; id?: string; exclude?: Set<string> }) {
  const cat = useCatalog()
  const opts = useMemo(() => placeOptions(cat).filter((o) => !exclude?.has(o.id)), [cat, exclude])
  return (
    <select id={id} className="field" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {inboxLabel !== null && <option value="">{inboxLabel}</option>}
      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
}
export function CategorySelect({ value, onChange, id, exclude }: { value: string | null; onChange: (v: string | null) => void; id?: string; exclude?: Set<string> }) {
  const cat = useCatalog()
  const opts = useMemo(() => {
    const out: { id: string; label: string }[] = []
    const roots = [...cat.categories.values()].filter((c) => !c.data.parent_id || !cat.categories.has(c.data.parent_id))
    const walk = (c: (typeof roots)[number], d: number) => {
      if (exclude?.has(c.id)) return
      out.push({ id: c.id, label: ' '.repeat(d) + c.data.name })
      for (const k of [...cat.categories.values()].filter((x) => x.data.parent_id === c.id).sort((a, b) => a.data.name.localeCompare(b.data.name, 'de'))) walk(k, d + 1)
    }
    roots.sort((a, b) => a.data.name.localeCompare(b.data.name, 'de')).forEach((r) => walk(r, 0))
    return out
  }, [cat, exclude])
  return (
    <select id={id} className="field" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Keine Kategorie</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
}

const close = () => setUI({ dialog: null, itemForm: null, popup: null })

// --- Schnell hinzufügen ---
export function QuickAddDialog() {
  const ui = getUI()
  const cat = useCatalog()
  const initial = ui.quickPlace && cat.places.has(ui.quickPlace) ? ui.quickPlace : (ui.selPlace && cat.places.has(ui.selPlace) ? ui.selPlace : null)
  const [place, setPlace] = useState<string | null>(initial)
  const [text, setText] = useState('')
  const lines = parseQuickAdd(text)
  const submit = () => {
    if (!lines.length) return
    const n = createItemsFromText(text, place)
    setUI({ quickPlace: place, dialog: null })
    if (place) setUI({ view: 'place', selPlace: place, selItem: null, screen: 'search' })
    toast(`${n} ${n === 1 ? 'Ding' : 'Dinge'} angelegt`)
  }
  return (
    <Dialog title="Schnell hinzufügen" onClose={close}>
      <div className="body" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() } }}>
        <label htmlFor="qb"><b>In Kiste</b></label>
        <PlaceSelect id="qb" value={place} onChange={setPlace} />
        <label htmlFor="qa"><b>Grobe Liste</b> <span className="muted">getrennt durch Komma oder Zeilenumbruch. Menge: 2x Name, Name ~200, Name 5 Stück</span></label>
        <textarea id="qa" className="field" spellCheck={false} value={text} placeholder="M3 Schrauben ~200, 2x LiPo 3S, Heißkleber" onChange={(e) => setText(e.target.value)} data-autofocus />
        <div className="box" style={{ maxHeight: 150, overflow: 'auto' }} aria-live="polite">
          {lines.length ? (
            <table className="t"><thead><tr><th>Name</th><th>Menge</th></tr></thead>
              <tbody>{lines.map((x, i) => <tr key={i}><td>{x.name}</td><td className="sug">{x.approx ? '~' : ''}{String(x.quantity).replace('.', ',')}{x.unit ? ' ' + x.unit : ''}</td></tr>)}</tbody></table>
          ) : <div className="muted" style={{ padding: '8px' }}>Noch nichts eingegeben.</div>}
          {lines.length > 0 && <div className="muted" style={{ padding: '4px 8px' }}>{lines.length} {lines.length === 1 ? 'Ding' : 'Dinge'} erkannt</div>}
        </div>
        <div className="foot">
          <button type="button" className="btn" onClick={() => setUI({ dialog: 'bulk' })}>CSV oder Tabelle einfügen …</button>
          <span style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn" onClick={close}>Abbrechen</button>
            <button type="button" className="btn pri" disabled={!lines.length} onClick={submit}>Anlegen <kbd>Strg+⏎</kbd></button>
          </span>
        </div>
      </div>
    </Dialog>
  )
}

// --- Bulk-Import ---
export function BulkDialog() {
  const cat = useCatalog()
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseBulk(text, cat), [text, cat])
  const ok = parsed.rows.filter((r) => !r.error)
  const onFile = async (f: File | undefined) => { if (f) setText(await f.text()) }
  const go = () => {
    for (const r of ok) createItem(rowToItem(r))
    toast(`${ok.length} Dinge importiert`)
    setUI({ dialog: null, screen: 'inbox' })
  }
  return (
    <Dialog title="Bulk-Import" onClose={close} wide>
      <div className="body">
        <div className="muted">Tabelle aus Excel oder Sheets einfügen oder eine CSV-Datei laden. Spalten: Name, Menge, Ort (Code oder Name), Kategorie, Tags, Notiz. Mit Kopfzeile werden Spalten nach Namen erkannt.</div>
        <textarea className="field" style={{ height: 110 }} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name;Menge;Ort;Kategorie\nSchrumpfschlauch rot;~20;R2-K6;Kabel'} aria-label="Tabelle" data-autofocus />
        <div className="acts"><label className="btn">CSV-Datei laden<input type="file" accept=".csv,.tsv,.txt,text/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} /></label></div>
        <div className="box" style={{ maxHeight: 220, overflow: 'auto' }}>
          {parsed.rows.length ? (
            <table className="t"><thead><tr><th>Z.</th><th>Name</th><th>Menge</th><th>Ort</th><th>Kategorie</th><th>Hinweis</th></tr></thead>
              <tbody>{parsed.rows.map((r) => (
                <tr key={r.line}>
                  <td className="sug">{r.line}</td><td>{r.name || '–'}</td>
                  <td className="sug">{r.quantity === null ? '–' : `${r.approx ? '~' : ''}${String(r.quantity).replace('.', ',')}${r.unit ? ' ' + r.unit : ''}`}</td>
                  <td className="sug">{r.placeId ? shortPath(cat, r.placeId) : 'Eingang'}</td>
                  <td>{r.categoryId ? cat.categories.get(r.categoryId)?.data.name : '–'}</td>
                  <td className={r.error ? 'err-text' : 'muted'}>{r.error ?? r.warnings.join('; ')}</td>
                </tr>))}</tbody></table>
          ) : <div className="muted" style={{ padding: 8 }}>Vorschau erscheint hier.</div>}
        </div>
        <div className="foot">
          <span className="muted" aria-live="polite">{ok.length} von {parsed.rows.length} Zeilen werden angelegt</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn" onClick={close}>Abbrechen</button>
            <button type="button" className="btn pri" disabled={!ok.length} onClick={go}>Importieren</button>
          </span>
        </div>
      </div>
    </Dialog>
  )
}

// --- Detailformular Ding ---
function specInputValue(f: SpecField, raw: string): SpecValue {
  if (raw === '') return null
  if (f.type === 'number') { const n = Number(raw.replace(',', '.')); return Number.isFinite(n) ? n : raw }
  if (f.type === 'bool') return raw === 'true'
  return raw
}
export function ItemFormDialog() {
  const ui = getUI()
  const cat = useCatalog()
  const editing = ui.itemForm?.id ? cat.items.get(ui.itemForm.id) : undefined
  const base: ItemData = editing ? editing.data : { name: '', quantity: 1, ...(ui.itemForm?.draft ?? {}) }
  const [d, setD] = useState<ItemData>(base)
  const [tags, setTags] = useState((base.tags ?? []).join(', '))
  const [aliases, setAliases] = useState((base.aliases ?? []).join(', '))
  const [qty, setQty] = useState(base.quantity === null || base.quantity === undefined ? '' : String(base.quantity).replace('.', ','))
  const [photoBusy, setPhotoBusy] = useState(false)
  const fields = cat.specFields(d.category_id)
  const set = (p: Partial<ItemData>) => setD((x) => ({ ...x, ...p }))
  const setSpec = (f: SpecField, raw: string) => setD((x) => ({ ...x, specs: { ...(x.specs ?? {}), [f.key]: specInputValue(f, raw) } }))
  const missing = fields.filter((f) => f.required && (d.specs?.[f.key] === undefined || d.specs?.[f.key] === null || d.specs?.[f.key] === ''))
  const nameOk = d.name.trim().length > 0
  const qn = qty.trim() === '' ? null : Number(qty.replace(',', '.'))
  const qtyOk = qn === null || (Number.isFinite(qn) && qn >= 0)

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    if (!nameOk || !qtyOk) return
    const out: ItemData = { ...d, name: d.name.trim(), quantity: qn }
    out.tags = tags.split(/[,;]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean)
    out.aliases = aliases.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
    if (!out.place_id) { out.place_id = null; if (out.status !== 'lent' && out.status !== 'in_use') out.status = 'inbox' }
    else if (out.status === 'inbox') out.status = 'stored'
    if (out.specs) for (const k of Object.keys(out.specs)) if (out.specs[k] === null || out.specs[k] === '') delete out.specs[k]
    for (const k of ['notes', 'unit', 'category_id', 'machine_id', 'lent_to', 'in_use_note'] as const) if (out[k] === '') out[k] = null
    if (editing) { saveItem(editing.id, out); setUI({ dialog: null, itemForm: null }) }
    else { const id = createItem(out); setUI({ dialog: null, itemForm: null, screen: 'search', view: 'detail', selItem: id, selPlace: null }) }
    toast(editing ? 'Gespeichert' : 'Angelegt')
  }
  const addPhoto = async (f: File | undefined) => {
    if (!f) return
    setPhotoBusy(true)
    const id = await storePhoto(f)
    set({ photo_ids: [...(d.photo_ids ?? []), id] })
    setPhotoBusy(false)
  }
  const machines = [...cat.machines.values()]
  return (
    <Dialog title={editing ? 'Ding bearbeiten' : 'Neues Ding'} onClose={close} wide>
      <form className="body" onSubmit={save} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save() }}>
        <div className="form">
          <label htmlFor="f-name">Name</label>
          <input id="f-name" className="field" value={d.name} onChange={(e) => set({ name: e.target.value })} data-autofocus aria-invalid={!nameOk} />
          <label htmlFor="f-qty">Menge</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input id="f-qty" className="field" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={!qtyOk} style={{ maxWidth: 110 }} />
            <input className="field" placeholder="Einheit" aria-label="Einheit" value={d.unit ?? ''} onChange={(e) => set({ unit: e.target.value })} style={{ maxWidth: 110 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><input type="checkbox" checked={!!d.quantity_approx} onChange={(e) => set({ quantity_approx: e.target.checked })} /> ungefähr</label>
          </div>
          <label htmlFor="f-place">Ort</label>
          <PlaceSelect id="f-place" value={d.place_id ?? null} onChange={(v) => set({ place_id: v })} />
          <label htmlFor="f-cat">Kategorie</label>
          <CategorySelect id="f-cat" value={d.category_id ?? null} onChange={(v) => set({ category_id: v })} />
          {fields.length > 0 && <div className="sec wide">Spezifikationen</div>}
          {fields.map((f) => (
            <FieldRow key={f.key} f={f} value={d.specs?.[f.key]} onChange={(raw) => setSpec(f, raw)} />
          ))}
          {missing.length > 0 && <div className="wide muted" role="status">Pflichtfelder fehlen: {missing.map((f) => f.label).join(', ')}. Speichern geht trotzdem.</div>}
          <label htmlFor="f-tags">Tags</label>
          <input id="f-tags" className="field" value={tags} placeholder="komma, getrennt" onChange={(e) => setTags(e.target.value)} />
          <label htmlFor="f-alias">Andere Namen</label>
          <input id="f-alias" className="field" value={aliases} placeholder="z. B. Akku, Batterie" onChange={(e) => setAliases(e.target.value)} />
          <label htmlFor="f-mach">Gehört zu</label>
          <select id="f-mach" className="field" value={d.machine_id ?? ''} onChange={(e) => set({ machine_id: e.target.value || null })}>
            <option value="">Keine Maschine</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.data.name}</option>)}
          </select>
          <label htmlFor="f-notes">Notiz</label>
          <textarea id="f-notes" className="field" style={{ height: 60 }} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
          <label>Fotos</label>
          <div className="acts" style={{ alignItems: 'center' }}>
            <label className="btn"><PixelIcon name="camera" size={12} /> Foto hinzufügen<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void addPhoto(e.target.files?.[0])} /></label>
            <span className="muted">{photoBusy ? 'Wird gespeichert …' : `${d.photo_ids?.length ?? 0} Foto${(d.photo_ids?.length ?? 0) === 1 ? '' : 's'}`}</span>
          </div>
        </div>
        <div className="foot">
          {editing ? <button type="button" className="btn danger" onClick={() => setUI({ popup: { kind: 'confirm', text: `„${editing.data.name}“ löschen?`, ok: 'Löschen', action: () => { deleteItem(editing.id); setUI({ dialog: null, itemForm: null, view: 'list', selItem: null }) } } })}>Löschen</button> : <span />}
          <span style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn" onClick={close}>Abbrechen</button>
            <button type="submit" className="btn pri" disabled={!nameOk || !qtyOk}>{editing ? 'Speichern' : 'Anlegen'} <kbd>Strg+⏎</kbd></button>
          </span>
        </div>
      </form>
    </Dialog>
  )
}
function FieldRow({ f, value, onChange }: { f: SpecField; value: SpecValue | undefined; onChange: (raw: string) => void }) {
  const id = `sf-${f.key}`
  const v = value === null || value === undefined ? '' : String(value)
  return (
    <>
      <label htmlFor={id}>{f.label}{f.required ? ' *' : ''}{f.unit ? ` (${f.unit})` : ''}</label>
      {f.type === 'choice' ? (
        <select id={id} className="field" value={v} onChange={(e) => onChange(e.target.value)}><option value="">–</option>{(f.choices ?? []).map((c) => <option key={c}>{c}</option>)}</select>
      ) : f.type === 'bool' ? (
        <select id={id} className="field" value={v} onChange={(e) => onChange(e.target.value)}><option value="">–</option><option value="true">ja</option><option value="false">nein</option></select>
      ) : (
        <input id={id} className="field" type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={v} onChange={(e) => onChange(e.target.value)} />
      )}
    </>
  )
}

// --- kleine Aktionen ---
function Mini({ title, children, onOk, ok, valid = true }: { title: string; children: ReactNode; onOk: () => void; ok: string; valid?: boolean }) {
  return (
    <Dialog title={title} onClose={close}>
      <form className="body" onSubmit={(e) => { e.preventDefault(); if (valid) onOk() }}>
        {children}
        <div className="foot"><span />
          <span style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn" onClick={close}>Abbrechen</button>
            <button type="submit" className="btn pri" disabled={!valid}>{ok}</button>
          </span>
        </div>
      </form>
    </Dialog>
  )
}

export function PopupHost() {
  const p = getUI().popup
  if (!p) return null
  switch (p.kind) {
    case 'move': return <MoveDialog p={p} />
    case 'lend': return <LendDialog id={p.id} />
    case 'use': return <UseDialog id={p.id} />
    case 'consume': return <ConsumeDialog id={p.id} />
    case 'place': return <PlaceFormDialog p={p} />
    case 'machine': return <MachineFormDialog id={p.id} />
    case 'category': return <CategoryFormDialog p={p} />
    case 'specfield': return <SpecFieldDialog p={p} />
    case 'tag': return <TagDialog tag={p.tag} />
    case 'confirm': return <ConfirmDialog p={p} />
    case 'pair': return null
  }
}

function MoveDialog({ p }: { p: Extract<Popup, { kind: 'move' }> }) {
  const cat = useCatalog()
  const first = cat.items.get(p.ids[0])
  const [to, setTo] = useState<string | null>(first ? cat.itemPlace(first) : null)
  return (
    <Mini title={p.ids.length === 1 ? 'Verschieben' : `${p.ids.length} Dinge verschieben`} ok="Verschieben" onOk={() => { moveItems(p.ids, to); close(); toast('Verschoben') }}>
      <label htmlFor="mv"><b>Neuer Ort</b></label>
      <PlaceSelect id="mv" value={to} onChange={setTo} />
    </Mini>
  )
}
function LendDialog({ id }: { id: string }) {
  const [who, setWho] = useState('')
  return (
    <Mini title="Verleihen" ok="Verleihen" valid={!!who.trim()} onOk={() => { setStatus(id, 'lent', { lent_to: who.trim() }); close() }}>
      <label htmlFor="lw"><b>An wen?</b></label>
      <input id="lw" className="field" value={who} onChange={(e) => setWho(e.target.value)} data-autofocus />
    </Mini>
  )
}
function UseDialog({ id }: { id: string }) {
  const cat = useCatalog()
  const [note, setNote] = useState('')
  const [machine, setMachine] = useState<string>(cat.items.get(id)?.data.machine_id ?? '')
  return (
    <Mini title="In Nutzung setzen" ok="In Nutzung" onOk={() => { setStatus(id, 'in_use', { in_use_note: note.trim() || null, ...(machine ? { machine_id: machine } : {}) }); close() }}>
      <label htmlFor="un"><b>Wo oder wofür?</b></label>
      <input id="un" className="field" value={note} placeholder="z. B. in der Fräse" onChange={(e) => setNote(e.target.value)} data-autofocus />
      <label htmlFor="um"><b>Maschine</b></label>
      <select id="um" className="field" value={machine} onChange={(e) => setMachine(e.target.value)}>
        <option value="">Keine</option>
        {[...cat.machines.values()].map((m) => <option key={m.id} value={m.id}>{m.data.name}</option>)}
      </select>
    </Mini>
  )
}
function ConsumeDialog({ id }: { id: string }) {
  const cat = useCatalog()
  const it = cat.items.get(id)
  const [n, setN] = useState('1')
  const v = Number(n.replace(',', '.'))
  const valid = Number.isFinite(v) && v > 0
  if (!it) return null
  return (
    <Mini title="Verbrauch buchen" ok="Abziehen" valid={valid} onOk={() => { patchItem(id, { quantity: Math.max(0, Math.round(((it.data.quantity ?? 0) - v) * 1000) / 1000) }); close(); toast('Verbrauch gebucht') }}>
      <div className="muted">Jetzt: {qtyText(it)}</div>
      <label htmlFor="cn"><b>Verbraucht</b></label>
      <input id="cn" className="field" inputMode="decimal" value={n} onChange={(e) => setN(e.target.value)} data-autofocus />
    </Mini>
  )
}
function ConfirmDialog({ p }: { p: Extract<Popup, { kind: 'confirm' }> }) {
  return (
    <Mini title="Sicher?" ok={p.ok} onOk={() => { p.action(); setUI({ popup: null }) }}>
      <div>{p.text}</div>
    </Mini>
  )
}

const KINDS: [PlaceKind, string][] = [['zone', 'Bereich'], ['shelf', 'Regal'], ['cabinet', 'Schrank'], ['box', 'Kiste'], ['drawer', 'Schublade'], ['compartment', 'Fach'], ['bag', 'Beutel'], ['machine', 'Maschine'], ['other', 'Sonstiges']]
function PlaceFormDialog({ p }: { p: Extract<Popup, { kind: 'place' }> }) {
  const cat = useCatalog()
  const ex = p.id ? cat.places.get(p.id) : undefined
  const [name, setName] = useState(ex?.data.name ?? '')
  const [code, setCode] = useState(ex?.data.human_id ?? '')
  const [kind, setKind] = useState<PlaceKind>((ex?.data.kind as PlaceKind) ?? 'box')
  const [parent, setParent] = useState<string | null>(ex ? (ex.data.parent_id ?? null) : (p.parent ?? null))
  const [notes, setNotes] = useState(ex?.data.notes ?? '')
  const codeTaken = !!code && [...cat.places.values()].some((x) => x.id !== p.id && (x.data.human_id ?? '').toLowerCase() === code.toLowerCase())
  const codeBad = !!code && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,23}$/.test(code)
  const exclude = useMemo(() => (p.id ? cat.subtreeIds(p.id) : undefined), [cat, p.id])
  const valid = name.trim().length > 0 && !codeTaken && !codeBad
  return (
    <Mini title={ex ? 'Ort bearbeiten' : 'Neuer Ort'} ok={ex ? 'Speichern' : 'Anlegen'} valid={valid} onOk={() => {
      const data: PlaceData = { ...(ex?.data ?? {}), name: name.trim(), kind, parent_id: parent, notes: notes || null, human_id: code || null }
      const id = p.id ?? uuid()
      getApp().repo.put('place', id, data)
      getApp().engine.schedule()
      close()
      setUI({ explorerSel: { entity: 'place', id } })
    }}>
      <div className="form">
        <label htmlFor="pn">Name</label><input id="pn" className="field" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        <label htmlFor="pc">Code</label>
        <div><input id="pc" className="field" style={{ width: '100%' }} value={code} placeholder="z. B. R2-K5" onChange={(e) => setCode(e.target.value)} aria-invalid={codeTaken || codeBad} />
          {codeTaken && <div className="err-text">Dieser Code ist schon vergeben.</div>}{codeBad && <div className="err-text">Buchstaben, Ziffern und . _ / - (bis 24 Zeichen).</div>}</div>
        <label htmlFor="pk">Art</label>
        <select id="pk" className="field" value={kind} onChange={(e) => setKind(e.target.value as PlaceKind)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label htmlFor="pp">Liegt in</label><PlaceSelect id="pp" value={parent} onChange={setParent} inboxLabel="Oberste Ebene" exclude={exclude} />
        <label htmlFor="pt">Notiz</label><textarea id="pt" className="field" style={{ height: 56 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Mini>
  )
}

function MachineFormDialog({ id }: { id: string | null }) {
  const cat = useCatalog()
  const ex = id ? cat.machines.get(id) : undefined
  const [name, setName] = useState(ex?.data.name ?? '')
  const [model, setModel] = useState(ex?.data.model ?? '')
  const [place, setPlace] = useState<string | null>(ex?.data.place_id ?? null)
  const [specs, setSpecs] = useState(Object.entries(ex?.data.specs ?? {}).map(([k, v]) => `${humanKey(k)}: ${v ?? ''}`).join('\n'))
  const [notes, setNotes] = useState(ex?.data.notes ?? '')
  return (
    <Mini title={ex ? 'Maschine bearbeiten' : 'Neue Maschine'} ok="Speichern" valid={!!name.trim()} onOk={() => {
      const sp: Record<string, SpecValue> = {}
      for (const line of specs.split('\n')) {
        const m = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.*)$/)
        if (m) sp[m[1].toLowerCase().replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0, 40)] = m[2]
      }
      const data: MachineData = { ...(ex?.data ?? {}), name: name.trim(), model: model || null, place_id: place, specs: sp, notes: notes || null }
      const mid = id ?? uuid()
      getApp().repo.put('machine', mid, data)
      getApp().engine.schedule()
      close()
      setUI({ machineSel: mid })
    }}>
      <div className="form">
        <label htmlFor="mn">Name</label><input id="mn" className="field" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        <label htmlFor="mm">Modell</label><input id="mm" className="field" value={model} onChange={(e) => setModel(e.target.value)} />
        <label htmlFor="mp">Steht auf</label><PlaceSelect id="mp" value={place} onChange={setPlace} inboxLabel="Kein Ort" />
        <label htmlFor="ms">Daten</label><textarea id="ms" className="field" style={{ height: 90 }} value={specs} placeholder={'Bauraum: 220 × 220 mm\nDüse: 0,4 mm'} onChange={(e) => setSpecs(e.target.value)} />
        <label htmlFor="mt">Notiz</label><textarea id="mt" className="field" style={{ height: 56 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Mini>
  )
}

function CategoryFormDialog({ p }: { p: Extract<Popup, { kind: 'category' }> }) {
  const cat = useCatalog()
  const ex = p.id ? cat.categories.get(p.id) : undefined
  const [name, setName] = useState(ex?.data.name ?? '')
  const [parent, setParent] = useState<string | null>(ex ? (ex.data.parent_id ?? null) : (p.parent ?? null))
  const [syn, setSyn] = useState((ex?.data.synonyms ?? []).join(', '))
  const exclude = useMemo(() => (p.id ? cat.categorySubtreeIds(p.id) : undefined), [cat, p.id])
  return (
    <Mini title={ex ? 'Kategorie bearbeiten' : 'Neue Kategorie'} ok="Speichern" valid={!!name.trim()} onOk={() => {
      const data: CategoryData = { ...(ex?.data ?? {}), name: name.trim(), parent_id: parent, synonyms: syn.split(/[,;]/).map((s) => s.trim()).filter(Boolean) }
      const id = p.id ?? uuid()
      getApp().repo.put('category', id, data)
      getApp().engine.schedule()
      close()
      setUI({ categorySel: id })
    }}>
      <div className="form">
        <label htmlFor="cn">Name</label><input id="cn" className="field" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        <label htmlFor="cp">Unter</label><CategorySelect id="cp" value={parent} onChange={setParent} exclude={exclude} />
        <label htmlFor="cs">Synonyme</label><input id="cs" className="field" value={syn} placeholder="komma, getrennt (für die Suche)" onChange={(e) => setSyn(e.target.value)} />
      </div>
    </Mini>
  )
}

const TYPES: [SpecType, string][] = [['text', 'Text'], ['number', 'Zahl'], ['date', 'Datum'], ['bool', 'Ja/Nein'], ['choice', 'Auswahl']]
function SpecFieldDialog({ p }: { p: Extract<Popup, { kind: 'specfield' }> }) {
  const cat = useCatalog()
  const c = cat.categories.get(p.categoryId)
  const ex = c?.data.spec_fields?.find((f) => f.key === p.key)
  const [label, setLabel] = useState(ex?.label ?? '')
  const [type, setType] = useState<SpecType>(ex?.type ?? 'text')
  const [unit, setUnit] = useState(ex?.unit ?? '')
  const [choices, setChoices] = useState((ex?.choices ?? []).join(', '))
  const [req, setReq] = useState(!!ex?.required)
  if (!c) return null
  const key = ex?.key ?? label.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const taken = !ex && !!c.data.spec_fields?.some((f) => f.key === key)
  return (
    <Mini title={ex ? 'Feld bearbeiten' : 'Neues Feld'} ok="Speichern" valid={!!key && !taken} onOk={() => {
      const f: SpecField = { key, label: label.trim(), type, ...(unit ? { unit } : {}), ...(type === 'choice' ? { choices: choices.split(/[,;]/).map((s) => s.trim()).filter(Boolean) } : {}), ...(req ? { required: true } : {}) }
      const list = (c.data.spec_fields ?? []).filter((x) => x.key !== key)
      const at = ex ? (c.data.spec_fields ?? []).findIndex((x) => x.key === key) : list.length
      list.splice(at, 0, f)
      getApp().repo.patch('category', c.id, { spec_fields: list })
      getApp().engine.schedule()
      close()
    }}>
      <div className="form">
        <label htmlFor="sl">Name</label><input id="sl" className="field" value={label} onChange={(e) => setLabel(e.target.value)} data-autofocus />
        <label htmlFor="st">Typ</label><select id="st" className="field" value={type} onChange={(e) => setType(e.target.value as SpecType)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label htmlFor="su">Einheit</label><input id="su" className="field" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="z. B. mAh" />
        {type === 'choice' && <><label htmlFor="sc">Werte</label><input id="sc" className="field" value={choices} onChange={(e) => setChoices(e.target.value)} placeholder="XT60, XT90, JST" /></>}
        <label>Pflicht</label><label><input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} /> Muss ausgefüllt werden</label>
        {taken && <div className="wide err-text">Dieses Feld gibt es schon.</div>}
      </div>
    </Mini>
  )
}

function TagDialog({ tag }: { tag: string }) {
  const [name, setName] = useState(tag)
  const rename = (to: string | null) => {
    const { repo, engine } = getApp()
    const norm = to?.trim().replace(/^#/, '') ?? null
    let n = 0
    for (const d of repo.all()) {
      if (d.deleted || !('tags' in d.data) || !Array.isArray((d.data as { tags?: string[] }).tags)) continue
      const tags = (d.data as { tags: string[] }).tags
      if (!tags.includes(tag)) continue
      const next = [...new Set(tags.map((t) => (t === tag ? norm : t)).filter((t): t is string => !!t))]
      repo.patch(d.entity, d.id, { tags: next } as never)
      n++
    }
    engine.schedule()
    close()
    toast(`${n} Einträge angepasst`)
  }
  return (
    <Dialog title={`Tag #${tag}`} onClose={close}>
      <form className="body" onSubmit={(e) => { e.preventDefault(); if (name.trim()) rename(name) }}>
        <label htmlFor="tg"><b>Umbenennen oder mit anderem Tag zusammenführen</b></label>
        <input id="tg" className="field" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        <div className="foot">
          <button type="button" className="btn danger" onClick={() => rename(null)}>Tag entfernen</button>
          <span style={{ display: 'flex', gap: 4 }}><button type="button" className="btn" onClick={close}>Abbrechen</button><button type="submit" className="btn pri">Umbenennen</button></span>
        </div>
      </form>
    </Dialog>
  )
}

export function LabelDialog({ id }: { id: string }) {
  const cat = useCatalog()
  const p = cat.places.get(id)
  if (!p) return null
  return (
    <Dialog title="Etikett drucken" onClose={close}>
      <div className="body">
        <div className="print-label" aria-label={`Etikett ${p.data.human_id ?? p.data.name}`}>
          <div className="lab"><i aria-hidden /> {p.data.human_id ?? p.data.name}</div>
          <div className="print-name">{p.data.name}</div>
          <div className="print-path">{cat.path(p.id)}</div>
        </div>
        <div className="muted">QR-Code folgt, sobald die Etikettenvorlage entschieden ist. Der Platz dafür ist links im Etikett.</div>
        <div className="foot"><span /><span style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="btn" onClick={close}>Schließen</button>
          <button type="button" className="btn pri" onClick={() => window.print()}>Drucken</button></span></div>
      </div>
    </Dialog>
  )
}

export { giveBack, nowIso }
