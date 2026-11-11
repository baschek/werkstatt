import { useCatalog } from './hooks'
import { Badge, Highlight } from './kit'
import { qtyText, shortPath, since, whereAbout } from './format'
import { PixelIcon } from './icons'
import type { ItemDoc } from '../data/types'
import { getUI } from './store'

export function ItemRow({ item, selected, onOpen, query = '', dragProps, cut, extra }: {
  item: ItemDoc; selected?: boolean; onOpen: () => void; query?: string; dragProps?: Record<string, unknown>; cut?: boolean; extra?: string
}) {
  const cat = useCatalog()
  const status = cat.effectiveStatus(item)
  const w = whereAbout(item)
  return (
    <button type="button" className={`row${cut ? ' cut' : ''}`} aria-selected={!!selected} onClick={onOpen} data-item={item.id} {...dragProps}>
      <div className="nm">{dragProps && <span className="grip"><PixelIcon name="grip" size={10} /></span>}<Highlight text={item.data.name} query={query} /></div>
      <div className="qty">{qtyText(item)}</div>
      <div className="path">{extra ?? shortPath(cat, cat.itemPlace(item))}{w ? ` · ${w}${since(item) ? ' seit ' + since(item) : ''}` : ''}</div>
      <div style={{ justifySelf: 'end' }}><Badge status={status} /></div>
    </button>
  )
}

export function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}
export const noDialog = () => getUI().dialog === null

/** Pfeiltasten in Listen: ↑/↓ bewegt den Fokus zwischen Zeilen. */
export function listKeys(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('button.row, .tn')]
  const i = rows.indexOf(document.activeElement as HTMLElement)
  if (i < 0) return
  e.preventDefault()
  rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
}
