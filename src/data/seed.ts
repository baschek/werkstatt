// Beispieldaten für den Demo-Modus (ohne Server): die Kellerwerkstatt aus dem Prototyp.
// Maße in Metern, y nach oben. Ein Ort hat `position` = Mitte der Grundfläche, `size` = [Breite, Höhe, Tiefe].
import type { AnyData, CategoryData, Doc, Entity, ItemData, LayoutData, MachineData, PlaceData, SpecField } from './types'

const T0 = '2026-11-01T08:00:00.000Z'
let rev = 0
const out: Doc[] = []
function add<E extends Entity>(entity: E, id: string, data: AnyData, extra: Partial<Doc> = {}) {
  out.push({ id, entity, rev: ++rev, updated_at: T0, deleted: false, origin: 'import', data, ...extra } as Doc)
}

/** Prototyp-Zentimeter (x, Tiefe, Höhe, Breite, Tiefe, Höhe) in Geometrie. */
const geo = (x: number, y: number, z: number, w: number, d: number, h: number) => ({
  position: [(x + w / 2) / 100, z / 100, (y + d / 2) / 100] as [number, number, number],
  size: [w / 100, h / 100, d / 100] as [number, number, number],
})

function place(id: string, data: PlaceData) { add('place', id, data) }

place('p-keller', { name: 'Keller', kind: 'zone' })
place('p-wand', { name: 'Werkbank-Wand', kind: 'zone', parent_id: 'p-keller' })
place('p-r2', { name: 'Regal R2', human_id: 'R2', kind: 'shelf', parent_id: 'p-wand', sort_order: 2, geometry: geo(4, 4, -4, 215, 66, 88) })
place('p-r1', { name: 'Regal R1', human_id: 'R1', kind: 'shelf', parent_id: 'p-wand', sort_order: 1, geometry: geo(238, 4, -4, 60, 60, 94) })
place('p-wb', { name: 'Werkbank', human_id: 'WB', kind: 'zone', parent_id: 'p-keller', geometry: geo(8, 104, 0, 176, 62, 38) })
place('p-cnc', { name: 'Fräse (GRBL)', human_id: 'CNC', kind: 'machine', parent_id: 'p-wb', geometry: geo(18, 112, 38, 64, 46, 34) })
place('p-prn', { name: '3D-Drucker', human_id: 'PRN', kind: 'machine', parent_id: 'p-wb', geometry: geo(112, 114, 38, 44, 40, 34) })
place('p-s1', { name: 'Schrank S1', human_id: 'S1', kind: 'cabinet', parent_id: 'p-keller', geometry: geo(236, 112, 0, 56, 82, 92) })

const r2 = ['Mikrocontroller', 'Akkus & Lader', 'Schrauben & Muttern', 'Fräser & Zubehör', 'Kleber & Klebeband', 'Kabel & Schlauch']
r2.forEach((name, i) => {
  const row = i < 3 ? 0 : 1
  const col = i % 3
  place(`p-r2-k${i + 1}`, { name, human_id: `R2-K${i + 1}`, kind: 'box', parent_id: 'p-r2', sort_order: i + 1, geometry: geo(12 + col * 68, 10, row ? 42 : 0, 60, 50, 32) })
})
const r1 = ['Filament', 'Druckerteile', 'Kleinwerkzeug']
r1.forEach((name, i) => {
  place(`p-r1-k${i + 1}`, { name, human_id: `R1-K${i + 1}`, kind: 'box', parent_id: 'p-r1', sort_order: i + 1, geometry: geo(243, 9, i * 30, 50, 50, 26) })
})
for (const [box, n] of [['p-r2-k2', 2], ['p-r2-k3', 4]] as const) {
  const first = box === 'p-r2-k2' ? 1 : 3
  for (let i = 0; i < n / 2; i++) place(`${box}-f${first + i}`, { name: `Fach ${first + i}`, kind: 'compartment', parent_id: box, sort_order: first + i })
}

// Statische Dinge: Regalböden und -pfosten (keine Orte).
const obj = (id: string, kind: string, x: number, y: number, z: number, w: number, d: number, h: number, label?: string) => {
  const g = geo(x, y, z, w, d, h)
  return { id, kind, label, position: g.position, size: g.size }
}
const layout: LayoutData = {
  room: { size: [3.4, 2.4, 2.7], floor_color: '#3b7e86' },
  objects: [
    obj('r2-boden-unten', 'plate', 4, 4, -4, 215, 66, 4, 'Regal R2 unten'),
    obj('r2-boden-mitte', 'plate', 4, 4, 38, 215, 66, 4, 'Regal R2 Mitte'),
    obj('r2-pfosten-l', 'post', 4, 4, 0, 4, 4, 84),
    obj('r2-pfosten-r', 'post', 215, 4, 0, 4, 4, 84),
    obj('r1-boden-unten', 'plate', 238, 4, -4, 60, 60, 4, 'Regal R1 unten'),
    obj('r1-boden-oben', 'plate', 238, 4, 86, 60, 60, 4, 'Regal R1 oben'),
  ],
  camera: { position: [4, 4, 4], target: [1.5, 0.3, 1.2], fov: 30 },
}
add('layout', 'main', layout)

const f = (key: string, label: string, type: SpecField['type'], unit?: string, required = false, choices?: string[]): SpecField =>
  ({ key, label, type, ...(unit ? { unit } : {}), ...(choices ? { choices } : {}), ...(required ? { required } : {}) })
const cat = (id: string, data: CategoryData) => add('category', id, data)
cat('c-elektronik', { name: 'Elektronik' })
cat('c-akkus', { name: 'Akkus', parent_id: 'c-elektronik', synonyms: ['Batterien', 'Energiespeicher'] })
cat('c-lipo', { name: 'LiPo', parent_id: 'c-akkus', spec_fields: [
  f('cells', 'Zellen', 'number', 'S', true), f('capacity_mah', 'Kapazität', 'number', 'mAh', true), f('c_rate', 'C-Rate', 'number', 'C'),
  f('charged_on', 'Geladen am', 'date'), f('connector', 'Stecker', 'choice', undefined, false, ['XT60', 'XT90', 'JST']),
] })
cat('c-mcu', { name: 'Mikrocontroller', parent_id: 'c-elektronik', synonyms: ['Board'] })
cat('c-loeten', { name: 'Löten', parent_id: 'c-elektronik' })
cat('c-kabel', { name: 'Kabel', parent_id: 'c-elektronik' })
cat('c-befestigung', { name: 'Befestigung' })
cat('c-schrauben', { name: 'Schrauben', parent_id: 'c-befestigung' })
cat('c-muttern', { name: 'Muttern', parent_id: 'c-befestigung' })
cat('c-3d', { name: '3D-Druck' })
cat('c-filament', { name: 'Filament', parent_id: 'c-3d', spec_fields: [
  f('material', 'Material', 'choice', undefined, true, ['PLA', 'PETG', 'ABS', 'TPU']), f('durchmesser', 'Durchmesser', 'text', 'mm'),
  f('rest', 'Rest', 'text'), f('duese', 'Düse', 'text', '°C'),
] })
cat('c-maschinen', { name: 'Maschinen' })
cat('c-fraeser', { name: 'Fräser', parent_id: 'c-maschinen', spec_fields: [
  f('durchmesser', 'Durchmesser', 'text', 'mm', true), f('schneiden', 'Schneiden', 'number'), f('schaft', 'Schaft', 'text', 'mm'), f('material', 'Material', 'text'),
] })
cat('c-verbrauch', { name: 'Verbrauch' })
cat('c-kleber', { name: 'Kleber', parent_id: 'c-verbrauch', synonyms: ['Klebstoff'] })
cat('c-mess', { name: 'Messgeräte', synonyms: ['Messgerät'] })
cat('c-werkzeug', { name: 'Werkzeug' })

const item = (id: string, data: ItemData, extra: Partial<Doc> = {}) => add('item', id, data, extra)
item('i-lipo-3s', { name: 'LiPo 3S 2200 mAh 25C', aliases: ['Akku'], category_id: 'c-lipo', place_id: 'p-r2-k2-f1', quantity: 4, unit: 'Stück', tags: ['projekt-drohne', 'akku'],
  specs: { cells: 3, capacity_mah: 2200, c_rate: 25, charged_on: '2026-11-03', connector: 'XT60' }, notes: 'Zwei Stück haben leichte Beulen, nur im Beutel laden.' })
item('i-lipo-4s', { name: 'LiPo 4S 1500 mAh 75C', aliases: ['Akku'], category_id: 'c-lipo', place_id: 'p-r2-k2-f2', quantity: 2, unit: 'Stück', tags: ['projekt-drohne', 'akku'],
  specs: { cells: 4, capacity_mah: 1500, c_rate: 75, charged_on: '2026-10-30' }, status: 'in_use', in_use_note: 'im Projekt Drohne', status_since: '2026-10-28T17:00:00.000Z' })
item('i-heisskleber', { name: 'Heißkleber-Sticks 11 mm', aliases: ['Klebepistole Sticks'], category_id: 'c-kleber', place_id: 'p-r2-k5', quantity: 30, quantity_approx: true, tags: ['kleben'] })
item('i-m3-schrauben', { name: 'M3 Schrauben Linsenkopf', category_id: 'c-schrauben', place_id: 'p-r2-k3-f3', quantity: 200, quantity_approx: true, tags: ['m3', '3d-druck'] })
item('i-m3-muttern', { name: 'M3 Muttern', category_id: 'c-muttern', place_id: 'p-r2-k3-f4', quantity: 150, quantity_approx: true, tags: ['m3'] })
item('i-arduino-nano', { name: 'Arduino Nano', category_id: 'c-mcu', place_id: 'p-r2-k1', quantity: 5, unit: 'Stück', tags: ['arduino'] })
item('i-esp32', { name: 'ESP32 DevKit', aliases: ['WLAN Board'], category_id: 'c-mcu', place_id: 'p-r2-k1', quantity: 3, unit: 'Stück', tags: ['esp32', 'projekt-drohne'] })
item('i-pla-schwarz', { name: 'PLA schwarz 1 kg', category_id: 'c-filament', place_id: 'p-r1-k1', quantity: 0.7, unit: 'kg', tags: ['3d-druck'],
  specs: { material: 'PLA', durchmesser: '1,75', rest: 'ca. 0,7 kg', duese: '210' } })
item('i-petg-grau', { name: 'PETG grau 1 kg', category_id: 'c-filament', place_id: 'p-r1-k1', quantity: 1, unit: 'kg', tags: ['3d-druck'],
  machine_id: 'm-prn', status: 'in_use', in_use_note: 'im Drucker', status_since: '2026-11-09T19:00:00.000Z' })
item('i-fraeser-3', { name: 'Schaftfräser 3 mm, 2 Schneiden', category_id: 'c-fraeser', place_id: 'p-r2-k4', quantity: 6, unit: 'Stück', tags: ['cnc'], machine_id: 'm-cnc',
  specs: { durchmesser: '3', schneiden: 2, schaft: '3,175', material: 'Hartmetall' } })
item('i-fraeser-6', { name: 'Schaftfräser 6 mm, 1 Schneide', category_id: 'c-fraeser', place_id: 'p-r2-k4', quantity: 1, unit: 'Stück', tags: ['cnc'], machine_id: 'm-cnc',
  status: 'in_use', in_use_note: 'in der Fräse', status_since: '2026-11-10T16:30:00.000Z' })
item('i-loetzinn', { name: 'Lötzinn 0,8 mm', aliases: ['Zinn'], category_id: 'c-loeten', place_id: 'p-wb', quantity: 1, unit: 'Rolle', tags: ['löten'] })
item('i-multimeter', { name: 'Multimeter', aliases: ['Messgerät'], category_id: 'c-mess', place_id: 'p-wb', quantity: 1, tags: ['messen'],
  status: 'lent', lent_to: 'Paul', status_since: '2026-11-03T18:00:00.000Z' })
item('i-schrumpf', { name: 'Schrumpfschlauch-Sortiment', category_id: 'c-kabel', place_id: 'p-r2-k6', quantity: 1, unit: 'Box', tags: ['löten'] })
item('i-bitset', { name: 'Bit-Set 32-teilig', aliases: ['Schraubendreher Set'], category_id: 'c-werkzeug', quantity: 1, suggested_place_id: 'p-r1-k3' },
  { origin: 'app', updated_at: '2026-11-11T17:42:00.000Z' })
item('i-kabelbinder', { name: 'Kabelbinder sortiert', category_id: 'c-verbrauch', quantity: 100, quantity_approx: true, suggested_place_id: 'p-r2-k6' },
  { origin: 'claude', updated_at: '2026-11-11T16:10:00.000Z' })
item('i-gewebeband', { name: 'Gewebeband schwarz', category_id: 'c-kleber', quantity: 2, unit: 'Rollen', tags: ['kleben'], suggested_place_id: 'p-r2-k5' },
  { origin: 'claude', updated_at: '2026-11-11T16:11:00.000Z' })

const machine = (id: string, data: MachineData) => add('machine', id, data)
machine('m-cnc', { name: 'Kleine Fräse', model: 'CNC-Fräse · GRBL 1.1', place_id: 'p-cnc', specs: {
  arbeitsbereich: '300 × 180 × 45 mm', spindel: '500 W, Spannzange ER11', steuerung: 'GRBL 1.1 über USB', zuletzt_gewartet: '02.11.2026' } })
machine('m-prn', { name: 'FDM-Drucker', model: '3D-Drucker', place_id: 'p-prn', specs: {
  bauraum: '220 × 220 × 250 mm', duese: '0,4 mm', heizbett: 'bis 100 °C', zuletzt_gewartet: '20.10.2026' } })

export const SEED_DOCS: Doc[] = out
export const SEED_REV = rev
