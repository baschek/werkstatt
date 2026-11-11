// Start der App: lokale Kopie öffnen, Backend wählen (Server oder Demo), Sync-Motor und Auslöser einrichten.
import { HttpBackend, getSession, setSession, type AuthStore, type DeviceCreds } from './data/http'
import { MockBackend } from './data/mock'
import { Repo } from './data/repo'
import { SyncEngine } from './data/sync'
import type { Backend } from './data/types'

const SERVER_KEY = 'werkstatt.server'
const DEMO_KEY = 'werkstatt-demo-server'
const DEMO_LOGGED_OUT = 'werkstatt.demo.loggedout'

export interface App {
  repo: Repo
  engine: SyncEngine
  mock: MockBackend | null
  serverUrl: string | null
  demo: boolean
}

function ls(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } }
function lsSet(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* ignorieren */ } }

export function configuredServer(): string | null {
  const env = (import.meta.env.VITE_TESS_URL as string | undefined)?.trim()
  return env || ls(SERVER_KEY) || null
}
export function setServerUrl(url: string | null) { lsSet(SERVER_KEY, url?.trim() || null) }
export const envLocked = () => !!(import.meta.env.VITE_TESS_URL as string | undefined)?.trim()

export function authStore(repo: Repo): AuthStore {
  return {
    getDevice: () => repo.kvGet<DeviceCreds>('device'),
    setDevice: async (d) => { await repo.kvSet('device', d) },
  }
}

export async function bootstrap(dbName = 'werkstatt'): Promise<App> {
  const repo = await Repo.open(dbName)
  const serverUrl = configuredServer()
  let backend: Backend
  let mock: MockBackend | null = null
  if (serverUrl) {
    backend = new HttpBackend(serverUrl, authStore(repo))
  } else {
    let state
    try { const raw = ls(DEMO_KEY); state = raw ? JSON.parse(raw) : undefined } catch { state = undefined }
    mock = new MockBackend(undefined, state)
    mock.onChange = () => { try { lsSet(DEMO_KEY, JSON.stringify(mock!.dump())) } catch { /* zu groß: egal */ } }
    mock.onChange()
    backend = mock
  }
  const engine = new SyncEngine(repo, backend)
  return { repo, engine, mock, serverUrl, demo: !serverUrl }
}

export function demoLoggedOut() { return ls(DEMO_LOGGED_OUT) === '1' }
export function setDemoLoggedOut(v: boolean) { lsSet(DEMO_LOGGED_OUT, v ? '1' : null) }
export function resetDemo() { lsSet(DEMO_KEY, null) }

/** Braucht die App eine Anmeldung? (nur im Server-Modus ohne Sitzung und ohne gekoppeltes Gerät, oder im Demo nach „Abmelden“) */
export async function needsLogin(app: App): Promise<boolean> {
  if (app.demo) return demoLoggedOut()
  if (await app.repo.kvGet('device')) return false
  return !getSession()
}
export { setSession }
