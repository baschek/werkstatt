import { useSyncExternalStore } from 'react'
import type { ItemData, ItemStatus } from '../data/types'
import type { App } from '../app'

export type Screen = 'search' | 'inbox' | 'away' | 'machines' | 'explorer' | 'categories' | 'settings'
export type Dialog = null | 'quick' | 'item' | 'bulk' | 'label'
export type Popup =
  | { kind: 'move'; ids: string[] }
  | { kind: 'lend'; id: string }
  | { kind: 'use'; id: string }
  | { kind: 'consume'; id: string }
  | { kind: 'place'; id: string | null; parent?: string | null }
  | { kind: 'machine'; id: string | null }
  | { kind: 'category'; id: string | null; parent?: string | null }
  | { kind: 'specfield'; categoryId: string; key: string | null }
  | { kind: 'tag'; tag: string }
  | { kind: 'confirm'; text: string; ok: string; action: () => void }
  | { kind: 'pair' }
export interface UIState {
  screen: Screen
  query: string
  statusFilter: ItemStatus | null
  view: 'list' | 'detail' | 'place'
  selItem: string | null
  selPlace: string | null
  dialog: Dialog
  itemForm: { id: string | null; draft?: Partial<ItemData> } | null
  quickPlace: string | null
  clipboard: { entity: 'item' | 'place'; ids: string[] } | null
  explorerSel: { entity: 'item' | 'place'; id: string } | null
  machineSel: string | null
  categorySel: string | null
  phoneTab: 'search' | 'new' | 'inbox'
  loggedOut: boolean
  toast: string | null
  popup: Popup | null
  phoneMore: Screen | null
  focusSearch: number
}

const initial: UIState = {
  screen: 'search', query: '', statusFilter: null, view: 'list', selItem: null, selPlace: null, dialog: null, itemForm: null,
  quickPlace: null, clipboard: null, explorerSel: null, machineSel: null, categorySel: null, phoneTab: 'search', loggedOut: false, toast: null, popup: null, phoneMore: null, focusSearch: 0,
}

let state = initial
const listeners = new Set<() => void>()
export function getUI() { return state }
export function setUI(p: Partial<UIState> | ((s: UIState) => Partial<UIState>)) {
  state = { ...state, ...(typeof p === 'function' ? p(state) : p) }
  listeners.forEach((l) => l())
}
export function useUI(): UIState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getUI)
}

let appRef: App | null = null
export function setApp(a: App) { appRef = a }
export function getApp(): App {
  if (!appRef) throw new Error('App nicht gestartet')
  return appRef
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(msg: string) {
  setUI({ toast: msg })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => setUI({ toast: null }), 3500)
}
