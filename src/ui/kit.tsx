import { useEffect, useRef, type ReactNode } from 'react'
import { STATUS_LABEL, type ItemDoc, type ItemStatus } from '../data/types'
import { PixelIcon, STATUS_ICON } from './icons'
import { Fragment } from 'react'

export function Badge({ status }: { status: ItemStatus }) {
  return (
    <span className={`badge ${status}`}>
      <PixelIcon name={STATUS_ICON[status]} size={11} />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function TitleBar({ title, children, onClose }: { title: ReactNode; children?: ReactNode; onClose?: () => void }) {
  return (
    <div className="tbar">
      <span>{title}</span>
      <span className="sp" />
      {children}
      {onClose && (
        <span className="wb">
          <button type="button" aria-label="Schließen" onClick={onClose}><PixelIcon name="close" size={8} /></button>
        </span>
      )}
    </div>
  )
}

export function Dialog({ title, onClose, children, wide, label }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], textarea, input, select')
    first?.focus()
    return () => prev?.focus?.()
  }, [])
  return (
    <div className="dlgwrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} className={`dlg${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label ?? title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose() }
          if (e.key === 'Tab') { // Fokus im Dialog halten
            const f = [...(ref.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((x) => !x.hasAttribute('disabled'))
            if (!f.length) return
            const first = f[0], last = f[f.length - 1]
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
          }
        }}>
        <TitleBar title={title} onClose={onClose} />
        {children}
      </div>
    </div>
  )
}

/** Suchtreffer im Text markieren (Wortteile, ß/Umlaute normalisiert). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const toks = foldKeep(q).split(/\s+/).filter((t) => t.length > 1)
  if (!toks.length) return <>{text}</>
  const folded = foldChars(text)
  const marks = new Array<boolean>(text.length).fill(false)
  for (const t of toks) {
    let i = folded.joined.indexOf(t)
    while (i >= 0) {
      for (let k = i; k < i + t.length; k++) for (const orig of folded.map[k] ?? []) marks[orig] = true
      i = folded.joined.indexOf(t, i + 1)
    }
  }
  const out: ReactNode[] = []
  let i = 0
  while (i < text.length) {
    let j = i
    while (j < text.length && marks[j] === marks[i]) j++
    const s = text.slice(i, j)
    out.push(marks[i] ? <span className="hi" key={i}>{s}</span> : <Fragment key={i}>{s}</Fragment>)
    i = j
  }
  return <>{out}</>
}
function foldKeep(s: string) { return s.toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue') }
function foldChars(text: string) {
  let joined = ''
  const map: number[][] = []
  for (let i = 0; i < text.length; i++) {
    const f = foldKeep(text[i])
    for (const ch of f) { joined += ch; map.push([i]) }
  }
  return { joined, map }
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
      ))}
    </dl>
  )
}

export function IdLabel({ id }: { id: string }) {
  return <div className="lab" aria-label={`Etikett ${id}`}><i aria-hidden /> {id}</div>
}

export function itemSortName(i: ItemDoc) { return i.data.name }
