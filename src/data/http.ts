// HttpBackend: spricht /werkstatt/v1/* auf TESS. Zwei Zugänge: gekoppeltes Gerät (signiert) oder Passkey-Sitzung (Bearer).
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import {
  BackendError, type Backend, type ChangesResponse, type Op, type PhotoMeta, type PushResponse, type SnapshotResponse, type StatusResponse,
} from './types'

export interface DeviceCreds { token: string; deviceId: string; privateKey: CryptoKey; name: string }
export interface AuthStore {
  getDevice(): Promise<DeviceCreds | undefined>
  setDevice(d: DeviceCreds | undefined): Promise<void>
}

const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

const SESSION_KEY = 'werkstatt.session'
export function getSession(): { token: string; expires_at?: string } | null {
  try { const v = sessionStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null } catch { return null }
}
export function setSession(s: { token: string; expires_at?: string } | null) {
  try { if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_KEY) } catch { /* ignorieren */ }
}

export class HttpBackend implements Backend {
  readonly kind = 'http' as const
  constructor(private base: string, private auth: AuthStore) {
    this.base = base.replace(/\/+$/, '')
  }

  private async headers(method: string, url: URL, body: Uint8Array | null, extra: Record<string, string> = {}) {
    const h: Record<string, string> = { ...extra }
    const device = await this.auth.getDevice()
    if (device) {
      const ts = String(Math.floor(Date.now() / 1000))
      const nonce = b64u(crypto.getRandomValues(new Uint8Array(16)))
      const digest = hex(await crypto.subtle.digest('SHA-256', (body ?? new Uint8Array()) as BufferSource))
      const msg = new TextEncoder().encode(`${method}\n${url.pathname}\n${url.search.replace(/^\?/, '')}\n${ts}\n${nonce}\n${digest}`)
      const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.privateKey, msg)
      Object.assign(h, { Authorization: `Bearer ${device.token}`, 'X-Werkstatt-Timestamp': ts, 'X-Werkstatt-Nonce': nonce, 'X-Werkstatt-Signature': b64u(sig) })
    } else {
      const s = getSession()
      if (!s) throw new BackendError(404, 'not_logged_in')
      h.Authorization = `Bearer ${s.token}`
    }
    return h
  }

  private async call<T>(method: string, path: string, opts: { json?: unknown; raw?: Blob; as?: 'json' | 'blob' } = {}): Promise<T | null> {
    const url = new URL(`${this.base}/werkstatt/v1${path}`)
    let body: Uint8Array | null = null
    const extra: Record<string, string> = {}
    if (opts.json !== undefined) { body = new TextEncoder().encode(JSON.stringify(opts.json)); extra['Content-Type'] = 'application/json' }
    if (opts.raw) { body = new Uint8Array(await opts.raw.arrayBuffer()); extra['Content-Type'] = opts.raw.type || 'application/octet-stream' }
    const headers = await this.headers(method, url, body, extra)
    let res: Response
    try {
      res = await fetch(url, { method, headers, body: (body ?? undefined) as BodyInit | undefined, credentials: 'omit', cache: 'no-store' })
    } catch {
      throw new BackendError(0, 'network')
    }
    if (!res.ok) {
      let code = 'error'
      try { code = ((await res.json()) as { error?: string }).error ?? code } catch { /* leer */ }
      throw new BackendError(res.status, code)
    }
    return opts.as === 'blob' ? ((await res.blob()) as unknown as T) : ((await res.json()) as T)
  }

  status() { return this.call<StatusResponse>('GET', '/status') as Promise<StatusResponse> }
  snapshot() { return this.call<SnapshotResponse>('GET', '/snapshot') as Promise<SnapshotResponse> }
  changes(since: number, limit = 500) { return this.call<ChangesResponse>('GET', `/changes?since=${since}&limit=${limit}`) as Promise<ChangesResponse> }
  push(ops: Op[]) { return this.call<PushResponse>('POST', '/push', { json: { ops } }) as Promise<PushResponse> }
  putPhoto(id: string, blob: Blob) { return this.call<PhotoMeta>('PUT', `/photos/${encodeURIComponent(id)}`, { raw: blob }) as Promise<PhotoMeta> }
  async getPhoto(id: string, thumb: boolean) {
    try { return await this.call<Blob>('GET', `/photos/${encodeURIComponent(id)}${thumb ? '/thumb' : ''}`, { as: 'blob' }) } catch (e) {
      if (e instanceof BackendError && e.status === 404) return null
      throw e
    }
  }
}

// --- Anmeldung (ohne Zugang, daher eigene Funktionen) ---
async function plainPost<T>(base: string, path: string, json: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}/werkstatt/v1${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json), credentials: 'omit',
    })
  } catch { throw new BackendError(0, 'network') }
  if (!res.ok) throw new BackendError(res.status, 'rejected')
  return (await res.json()) as T
}

export async function loginWithPasskey(base: string) {
  const { ceremony_id, options } = await plainPost<{ ceremony_id: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(base, '/webauthn/login/options', {})
  const credential = await startAuthentication({ optionsJSON: options })
  const s = await plainPost<{ token: string; expires_at: string }>(base, '/webauthn/login/verify', { ceremony_id, credential })
  setSession(s)
  return s
}
export async function registerPasskey(base: string, code: string, label: string) {
  const { ceremony_id, options } = await plainPost<{ ceremony_id: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(base, '/webauthn/register/options', { code })
  const credential = await startRegistration({ optionsJSON: options })
  return plainPost<{ ok: boolean; passkey_id: string }>(base, '/webauthn/register/verify', { ceremony_id, credential, label })
}
export async function logout(base: string) {
  const s = getSession()
  if (s) { try { await fetch(`${base.replace(/\/+$/, '')}/werkstatt/v1/webauthn/logout`, { method: 'POST', headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' }, body: '{}', credentials: 'omit' }) } catch { /* egal */ } }
  setSession(null)
}
/** Gerät koppeln: Schlüssel erzeugen (nicht exportierbar), Code einlösen. */
export async function pairDevice(base: string, code: string, name: string): Promise<DeviceCreds> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey)
  const r = await plainPost<{ token: string; device_id: string }>(base, '/pair', { code, device_name: name, public_key: b64u(spki) })
  return { token: r.token, deviceId: r.device_id, privateKey: pair.privateKey, name }
}
