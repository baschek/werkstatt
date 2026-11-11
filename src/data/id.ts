export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  const h = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)]
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`
}
export const nowIso = () => new Date().toISOString()
