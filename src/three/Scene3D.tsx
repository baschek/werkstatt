// 3D-Ansicht: orthografische isometrische Kamera (Winkel wie im Prototyp), Kisten und Möbel aus place.geometry und layout.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import type { LayoutData, PlaceDoc, Vec3 } from '../data/types'
import { C } from '../ui/tokens'

export interface SceneProps {
  places: PlaceDoc[]
  layout?: LayoutData
  /** Ort-IDs, die zur Suche passen (leuchten). */
  hits: Set<string>
  /** Suche aktiv: alle anderen auf 42 % */
  active: boolean
  selected: string | null
  onSelect: (id: string) => void
  reducedMotion: boolean
}

const DIR = new THREE.Vector3(1, 1, 1).normalize()
const FLY_MS = 700
const ZOOM = 1.7

function bezier(x1: number, y1: number, x2: number, y2: number) { // cubic-bezier(.3,.7,.2,1) wie im Prototyp
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  return (x: number) => {
    let t = x
    for (let i = 0; i < 8; i++) { const d = (sx(t) - x); const dx = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(d) < 1e-5 || !dx) break; t -= d / dx }
    return sy(Math.min(1, Math.max(0, t)))
  }
}
const ease = bezier(0.3, 0.7, 0.2, 1)

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex)
  return new THREE.Color(c.r * k, c.g * k, c.b * k)
}

interface BoxEntry { id: string; mesh: THREE.Mesh; mats: THREE.MeshBasicMaterial[]; baseTop: THREE.Color; baseL: THREE.Color; baseR: THREE.Color; label: HTMLSpanElement; center: THREE.Vector3; top: THREE.Vector3; name: string; code: string }

export default function Scene3D(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ update: (p: SceneProps) => void } | null>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(C.scene)
    el.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('role', 'img')
    renderer.domElement.setAttribute('aria-label', '3D-Ansicht der Werkstatt. Kisten sind auch in der Liste rechts erreichbar.')
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'
    el.appendChild(overlay)
    const tip = document.createElement('div')
    tip.className = 'tip'
    tip.style.display = 'none'
    el.appendChild(tip)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    const world = new THREE.Group()
    scene.add(world)
    const outline = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: 0xffffff, linewidth: 2 }))
    outline.visible = false
    outline.renderOrder = 10
    ;(outline.material as LineMaterial).depthTest = false
    scene.add(outline)

    let boxes: BoxEntry[] = []
    let sig = ''
    let bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3.5, 1, 2.7))
    let center = new THREE.Vector3(1.75, 0.4, 1.35)
    const target = new THREE.Vector3()
    let zoom = 1
    let baseHalfH = 2
    let anim: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t0: number } | null = null
    let hover: string | null = null
    let raf = 0
    let dirty = true
    let w = 1, h = 1

    const disposeWorld = () => {
      for (const c of [...world.children]) {
        world.remove(c)
        c.traverse((o) => {
          const m = o as THREE.Mesh
          m.geometry?.dispose?.()
          const mat = m.material as THREE.Material | THREE.Material[] | undefined
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.()
        })
      }
      overlay.replaceChildren()
      boxes = []
    }

    const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
    function addBox(pos: Vec3, size: Vec3, rotY: number, cols: [THREE.Color, THREE.Color, THREE.Color], furniture: boolean, id: string, name: string, code: string) {
      const [px, py, pz] = pos
      const [sw, sh, sd] = size
      const geo = new THREE.BoxGeometry(sw, sh, sd)
      const mk = (c: THREE.Color) => new THREE.MeshBasicMaterial({ color: c, transparent: true })
      const [t, l, r] = cols
      // Reihenfolge: +x, -x, +y, -y, +z, -z
      const mats = [mk(r), mk(r), mk(t), mk(t), mk(l), mk(l)]
      const mesh = new THREE.Mesh(geo, mats)
      mesh.position.set(px, py + sh / 2, pz)
      mesh.rotation.y = rotY
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat)
      mesh.add(edges)
      world.add(mesh)
      if (!furniture) {
        const label = document.createElement('span')
        label.className = 'idl'
        label.textContent = code
        overlay.appendChild(label)
        mesh.userData.placeId = id
        boxes.push({ id, mesh, mats, baseTop: t.clone(), baseL: l.clone(), baseR: r.clone(), label, center: new THREE.Vector3(px, py + sh / 2, pz), top: new THREE.Vector3(px, py + sh, pz), name, code })
      }
    }

    function rebuild(p: SceneProps) {
      disposeWorld()
      const room = p.layout?.room
      const [rw, , rd] = room?.size ?? [3.5, 2.4, 2.7]
      // Boden + Raster (alle 35 cm, wie im Prototyp)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), new THREE.MeshBasicMaterial({ color: room?.floor_color ?? C.floor }))
      floor.rotation.x = -Math.PI / 2
      floor.position.set(rw / 2, -0.001, rd / 2)
      world.add(floor)
      const pts: number[] = []
      for (let x = 0; x <= rw + 1e-6; x += 0.35) pts.push(x, 0, 0, x, 0, rd)
      for (let z = 0; z <= rd + 1e-6; z += 0.35) pts.push(0, 0, z, rw, 0, z)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      world.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 })))

      const fr: [THREE.Color, THREE.Color, THREE.Color] = [new THREE.Color(C.frT), new THREE.Color(C.frL), new THREE.Color(C.frR)]
      for (const o of p.layout?.objects ?? []) {
        if (!o.position || !o.size) continue
        const cols: [THREE.Color, THREE.Color, THREE.Color] = o.color ? [new THREE.Color(o.color), shade(o.color, 0.81), shade(o.color, 0.63)] : fr
        addBox(o.position, o.size, o.rotation_y ?? 0, cols, true, o.id, o.label ?? o.id, '')
      }
      for (const pl of p.places) {
        const g2 = pl.data.geometry
        if (!g2?.position || !g2.size) continue
        const top = g2.color ?? C.boxT
        const cols: [THREE.Color, THREE.Color, THREE.Color] = g2.color ? [new THREE.Color(top), shade(top, 0.81), shade(top, 0.63)] : [new THREE.Color(C.boxT), new THREE.Color(C.boxL), new THREE.Color(C.boxR)]
        addBox(g2.position, g2.size, g2.rotation_y ?? 0, cols, false, pl.id, pl.data.name, pl.data.human_id ?? pl.data.name)
      }
      const b = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(rw, 0.1, rd))
      b.expandByObject(world)
      bounds = b
      center = b.getCenter(new THREE.Vector3())
      fit()
      applyState(p)
    }

    function fit() {
      const rect = el.getBoundingClientRect()
      w = Math.max(1, rect.width); h = Math.max(1, rect.height)
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'
      const aspect = w / h
      // Ausdehnung der Szene in Kamerakoordinaten bestimmen
      camera.position.copy(center).addScaledVector(DIR, 20)
      camera.lookAt(center)
      camera.updateMatrixWorld(true)
      const inv = camera.matrixWorldInverse
      let mx = 0, my = 0
      const { min, max } = bounds
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        const v = new THREE.Vector3(x, y, z).applyMatrix4(inv)
        mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y))
      }
      baseHalfH = Math.max(my * 1.08, (mx * 1.08) / aspect)
      camera.left = -baseHalfH * aspect; camera.right = baseHalfH * aspect
      camera.top = baseHalfH; camera.bottom = -baseHalfH
      const lm = outline.material as LineMaterial
      lm.resolution.set(w, h)
      place()
    }
    function place() {
      camera.zoom = zoom
      camera.position.copy(target).addScaledVector(DIR, 20)
      camera.lookAt(target)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld(true)
    }

    function applyState(p: SceneProps) {
      for (const b of boxes) {
        const hit = p.hits.has(b.id)
        const dim = p.active && !hit
        const [t, l, r] = hit ? [new THREE.Color(C.hitT), new THREE.Color(C.hitL), new THREE.Color(C.hitR)] : [b.baseTop, b.baseL, b.baseR]
        b.mats[2].color.copy(t); b.mats[3].color.copy(t)
        b.mats[4].color.copy(l); b.mats[5].color.copy(l)
        b.mats[0].color.copy(r); b.mats[1].color.copy(r)
        for (const m of b.mats) { m.opacity = dim ? 0.42 : 1; m.depthWrite = !dim }
        b.label.classList.toggle('dim', dim)
      }
      updateOutline(p.selected, 2)
      dirty = true
      kick()
    }

    function updateOutline(id: string | null, width: number) {
      const b = boxes.find((x) => x.id === id)
      if (!b) { outline.visible = false; return }
      const eg = new THREE.EdgesGeometry(b.mesh.geometry as THREE.BoxGeometry)
      const pos = eg.getAttribute('position')
      const arr: number[] = []
      const v = new THREE.Vector3()
      b.mesh.updateMatrixWorld(true)
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(b.mesh.matrixWorld); arr.push(v.x, v.y, v.z) }
      outline.geometry.setPositions(arr)
      ;(outline.material as LineMaterial).linewidth = width
      outline.visible = true
    }

    function flyTo(to: THREE.Vector3, z: number, animate: boolean) {
      if (!animate || latest.current.reducedMotion) { anim = null; target.copy(to); zoom = z; place(); dirty = true; kick(); return }
      anim = { from: target.clone(), to: to.clone(), z0: zoom, z1: z, t0: performance.now() }
      kick()
    }

    function labels() {
      const v = new THREE.Vector3()
      for (const b of boxes) {
        v.copy(b.top).project(camera)
        b.label.style.left = `${((v.x + 1) / 2) * w}px`
        b.label.style.top = `${((1 - v.y) / 2) * h}px`
      }
    }

    function frame(now: number) {
      raf = 0
      if (anim) {
        const k = Math.min(1, (now - anim.t0) / FLY_MS)
        const e = ease(k)
        target.lerpVectors(anim.from, anim.to, e)
        zoom = anim.z0 + (anim.z1 - anim.z0) * e
        place()
        dirty = true
        if (k >= 1) anim = null
      }
      if (dirty) {
        dirty = false
        renderer.render(scene, camera)
        labels()
      }
      if (anim || dirty) kick()
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame) }

    // Zeiger
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    function pick(ev: PointerEvent): string | null {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hits = ray.intersectObjects(boxes.map((b) => b.mesh), false)
      return hits.length ? (hits[0].object.userData.placeId as string) : null
    }
    const onMove = (ev: PointerEvent) => {
      const id = pick(ev)
      if (id !== hover) {
        hover = id
        renderer.domElement.style.cursor = id ? 'pointer' : 'default'
        updateOutline(id ?? null, 1.4)
        if (!id) updateOutline(latest.current.selected, 2)
        dirty = true; kick()
      }
      if (id) {
        const b = boxes.find((x) => x.id === id)!
        const r = el.getBoundingClientRect()
        tip.textContent = `${b.code} · ${b.name}`
        tip.style.display = 'block'
        tip.style.left = `${Math.max(0, Math.min(ev.clientX - r.left + 12, r.width - 190))}px`
        tip.style.top = `${ev.clientY - r.top + 14}px`
      } else tip.style.display = 'none'
    }
    const onLeave = () => { hover = null; tip.style.display = 'none'; updateOutline(latest.current.selected, 2); dirty = true; kick() }
    const onClick = (ev: PointerEvent) => { const id = pick(ev); if (id) latest.current.onSelect(id) }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('click', onClick as unknown as EventListener)

    const ro = new ResizeObserver(() => { fit(); dirty = true; kick() })
    ro.observe(el)

    let lastSelected: string | null | undefined
    api.current = {
      update(p) {
        const s = JSON.stringify([p.places.map((x) => [x.id, x.rev, x.updated_at, x.data.geometry, x.data.human_id]), p.layout])
        if (s !== sig) { sig = s; rebuild(p); target.copy(center); zoom = 1; lastSelected = undefined }
        applyState(p)
        if (p.selected !== lastSelected) {
          lastSelected = p.selected
          const b = boxes.find((x) => x.id === p.selected)
          if (b) flyTo(b.center, ZOOM, true)
          else flyTo(center, 1, true)
        }
      },
    }
    api.current.update(latest.current)
    target.copy(center); place(); dirty = true; kick()
    // Test-/Debug-Haken
    ;(el as unknown as { __scene?: unknown }).__scene = { boxes: () => boxes.map((b) => ({ id: b.id, label: b.label.textContent })) }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      renderer.domElement.removeEventListener('click', onClick as unknown as EventListener)
      disposeWorld()
      edgeMat.dispose()
      renderer.dispose()
      el.replaceChildren()
      api.current = null
    }
  }, [])

  useEffect(() => { api.current?.update(props) })

  return <div className="scene" ref={host} />
}
