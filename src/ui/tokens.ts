// Design-Tokens "Werkbank 98" (docs/design-handoff.md). Einzige Quelle für Farben in TS (3D, Tests); CSS hat dieselben Werte.
export const C = {
  bg2: '#c3c7cb', pane: '#ffffff', ink: '#15181a', muted: '#4b5359', line: '#7d848a',
  titleFrom: '#0d3b66', titleTo: '#3c7aa8', titleInk: '#ffffff',
  select: '#0d3b66', selectInk: '#ffffff',
  ok: '#175c28', okBg: '#d7ecd9', warn: '#7a4e00', warnBg: '#f4e7c4', err: '#a01818', errBg: '#f3d3d3',
  label: '#f4f1e6', labelInk: '#15181a',
  scene: '#2e6b72', floor: '#3b7e86',
  boxT: '#e3c48b', boxL: '#b89256', boxR: '#8f6e3a',
  frT: '#9aa3ab', frL: '#737c84', frR: '#555d64',
  hitT: '#ffe23d', hitL: '#d8b800', hitR: '#a58c00',
  white: '#ffffff', hintBg: '#0d2b2e',
} as const

/** Textpaare (Vordergrund, Hintergrund, Name), die mindestens 4,5:1 erreichen müssen. */
export const TEXT_PAIRS: [string, string, string][] = [
  [C.ink, C.bg2, 'Text auf Fensterfläche/Knopf'],
  [C.ink, C.pane, 'Text auf Feld'],
  [C.muted, C.bg2, 'Nebentext auf Fensterfläche'],
  [C.muted, C.pane, 'Nebentext auf Feld'],
  [C.titleInk, C.titleFrom, 'Titelleiste links'],
  [C.titleInk, C.titleTo, 'Titelleiste rechts'],
  [C.selectInk, C.select, 'gewählte Zeile, primärer Knopf'],
  [C.select, C.pane, 'Suchtreffer-Markierung (invertiert), Links'],
  [C.select, C.bg2, 'Akzent auf Fensterfläche'],
  [C.ok, C.okBg, 'Badge Eingelagert / Synchron'],
  [C.warn, C.warnBg, 'Badge Verliehen, In Nutzung / Offline, Konflikt'],
  [C.err, C.errBg, 'Badge Eingang / Sync-Fehler'],
  [C.ok, C.pane, 'ok auf Feld'],
  [C.warn, C.pane, 'warn auf Feld'],
  [C.err, C.pane, 'err auf Feld'],
  [C.ink, C.warnBg, 'Text in Hinweisfeld (Konflikt)'],
  [C.ink, C.errBg, 'Text in Hinweisfeld (Fehler)'],
  [C.titleInk, C.err, 'Zähler-Badge am Reiter'],
  [C.labelInk, C.label, 'Etikett mit Kisten-ID'],
  [C.white, C.hintBg, 'Hinweiszeile im 3D-Bild'],
  [C.selectInk, C.select, 'Hover-Beschriftung im 3D-Bild'],
  [C.labelInk, C.hitT, 'ID auf Treffer-Deckel'],
  [C.labelInk, C.boxT, 'ID auf Kisten-Deckel'],
]

function lin(c: number) { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
