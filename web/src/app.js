/*! custom-web_slicer 0.1.4 — 웹 슬라이서 화면 · AGPL-3.0-or-later · 소스: https://github.com/keidischoi/g7-plugin-custom-web_slicer
 *  엔진: three-slicer (OrcaSlicer 를 WebAssembly 로 옮긴 것, AGPL) — 이 화면을 열 때만 받음
 *  모델 읽기: model-read.cjs (출력 검사기 custom-print_check 의 계산 핵심, MIT)
 *  흐름: 파일 → 프린터 · 품질 · 필라멘트 → 슬라이스(Web Worker) → .gcode.3mf / .gcode 내려받기 · 프린터 라운지로 보내기 */
import PCMod from './model-read.cjs'
import { bambuHeader, buildGcode3mf } from './gcode3mf.js'
import { pngBytes, renderThumb } from './thumb.js'
import { createSlicerClient } from 'three-slicer/client'
import { takeHandoff, unzipModels } from './handoff.js'

const V = '0.1.4', LOUNGE = '/api/plugins/custom-my_printer', SRC = 'https://github.com/keidischoi/g7-plugin-custom-web_slicer'
const PC = (PCMod && PCMod.read) ? PCMod : self.PCCore
const MAX_TOOLS = 8, BIG_TRIS = 400000
const SEND_ADMIN_ONLY = true   // 0.1.1 「📤 내 프린터로 보내기」는 시험하는 동안 관리자에게만 (실제 프린터에서 확인되면 false 로)
const VENDOR_NAME = { BBL: 'Bambu Lab' }

/* ───────── 작은 도구 ───────── */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString()
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const dur = (s) => { s = Math.max(0, Math.round(s / 60)); const h = Math.floor(s / 60), m = s % 60; return h ? h + '시간' + (m ? ' ' + m + '분' : '') : Math.max(1, m) + '분' }
const scalar = (v) => (Array.isArray(v) ? v[0] : v)
function token() {
  let t = ''
  try { if (window.G7Core && G7Core.api && typeof G7Core.api.getToken === 'function') t = G7Core.api.getToken() || '' } catch (e) {}
  if (!t) { try { t = localStorage.getItem('auth_token') || '' } catch (e) {} }
  t = String(t).replace(/^"+|"+$/g, '')
  return !t || t === 'undefined' || t === 'null' ? '' : t
}
function headers() {
  const h = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, t = token()
  if (t) h.Authorization = 'Bearer ' + t
  return h
}
function hexDist(a, b) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  if (!/^#[0-9a-f]{6}/i.test(a || '') || !/^#[0-9a-f]{6}/i.test(b || '')) return 1e9
  const x = p(a), y = p(b)
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2
}

/**
 * G-code 로 출력 시간 어림 (초) — 엔진이 다색일 때 예상 시간을 주지 않아서. 이동 거리 ÷ 속도 + 기다림(G4) + 색 바꿈(M620 S…)마다 swapSec.
 *  가속은 안 셈 (실제보다 조금 짧게 나옴)
 */
function estimateSeconds(g, swapSec = 50) {
  let x = 0, y = 0, z = 0, f = 3000, t = 0, swaps = 0, i = 0
  const L = g.length
  while (i < L) {
    let j = g.indexOf('\n', i); if (j < 0) j = L
    const c0 = g.charCodeAt(i), c1 = g.charCodeAt(i + 1)
    if (c0 === 71 && (c1 === 48 || c1 === 49) && (g.charCodeAt(i + 2) === 32 || g.charCodeAt(i + 2) === 9)) {   // G0 · G1
      let k = i + 3, nx = x, ny = y, nz = z
      while (k < j) {
        const ch = g.charCodeAt(k)
        if (ch === 59) break   // ; 주석
        if (ch === 88 || ch === 89 || ch === 90 || ch === 70) {
          let e = k + 1; while (e < j && g.charCodeAt(e) !== 32 && g.charCodeAt(e) !== 59) e++
          const v = parseFloat(g.slice(k + 1, e))
          if (!isNaN(v)) { if (ch === 88) nx = v; else if (ch === 89) ny = v; else if (ch === 90) nz = v; else f = v }
          k = e
        } else k++
      }
      const d = Math.hypot(nx - x, ny - y, nz - z)
      if (d > 0 && f > 0) t += d / (f / 60)
      x = nx; y = ny; z = nz
    } else if (c0 === 71 && c1 === 52 && g.charCodeAt(i + 2) === 32) {   // G4 S초 · P밀리초
      const m = /([SP])(\d+(?:\.\d+)?)/.exec(g.slice(i, j)); if (m) t += m[1] === 'S' ? +m[2] : +m[2] / 1000
    } else if (c0 === 77 && g.startsWith('M620 S', i) && !g.startsWith('M620 S255', i)) swaps++
    i = j + 1
  }
  return t + swaps * swapSec
}

/* ───────── 상태 ───────── */
const S = {
  file: null, tris: null, info: null, plan: null, thumb: null,
  lounge: [], loggedIn: false, pid: 0, admin: false,              // 프린터 라운지 내 프린터 · 고른 것 (0 = 없음)
  vendor: 'BBL', printer: 'Bambu Lab A1 0.4 nozzle', process: '', fil: [],
  infill: 15, support: false, brim: false,
  busy: false, prog: 0, result: null, msg: '', err: '', sent: '',
  zip: null,                                                      // 0.1.4 ZIP 안의 모델들 {name, list:[{name, data}]} — 하나 고르기
}
let ST = null, PROCS = null, FILS = null, client = null, root = null

async function engineData() {
  if (!ST) ST = await import('three-slicer/settings')
  if (!PROCS) PROCS = await ST.processPresets()
  if (!FILS) FILS = await ST.filamentPresets()
  return ST
}
const nameOf = (x) => (typeof x === 'string' ? x : x && x.name)
function processList() { try { return (PROCS.listFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) { return [] } }
function filamentLists() {
  let rec = [], all = []
  try { rec = (FILS.recommendedFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) {}
  try { all = (FILS.listFor(S.printer) || []).map(nameOf).filter(Boolean) } catch (e) {}
  return { rec, all: all.filter((x) => !rec.includes(x)) }
}
function printerEntry(name = S.printer) {
  const v = ST && ST.printersByVendor
  if (!v) return null
  for (const k of Object.keys(v)) if (v[k][name]) return v[k][name]
  return null
}
function defaultProcess() {
  const list = processList(), e = printerEntry()
  if (e && list.includes(e[3])) return e[3]
  return list.find((x) => /0\.20mm Standard/i.test(x)) || list[0] || ''
}
function defaultFilament(hex) {
  const { rec, all } = filamentLists(), pool = rec.length ? rec : all
  return pool.find((x) => /PLA Basic/i.test(x)) || pool.find((x) => /PLA/i.test(x)) || pool[0] || ''
}
/** 바닥 크기 [가로, 세로, 높이] — printable_area ("0x0","256x0",…) · printable_height */
function bedSize() {
  try {
    const s = ST.printerSettings(S.printer) || {}, pts = (Array.isArray(s.printable_area) ? s.printable_area : String(s.printable_area || '').split(',')).map((p) => String(p).split('x').map(Number))
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Number(scalar(s.printable_height)) || 250]
  } catch (e) { return null }
}

/** 프린터 라운지의 내 프린터 → 엔진 프린터 이름 (같은 제조사 · 모델, 0.4 노즐 먼저) */
function matchPreset(p) {
  if (!ST) return null
  const want = norm((p.brand || '') + ' ' + (p.model || '')), model = norm(p.model)
  let best = null, bs = 0
  for (const v of Object.keys(ST.printersByVendor)) {
    for (const name of Object.keys(ST.printersByVendor[v])) {
      const base = norm(name.replace(/\s*\d+(\.\d+)?\s*nozzle\s*$/i, ''))
      let sc = base === want ? 100 : model && base.endsWith(model) && base.length - model.length <= 12 ? 70 : 0
      if (!sc) continue
      if (/ 0\.4 nozzle$/i.test(name)) sc += 5
      if (sc > bs) { bs = sc; best = [v, name] }
    }
  }
  return best
}

/* ───────── 모델 ───────── */
/** 색 → 압출기 계획: 물체마다 한 색이면 색마다 압출기 하나 (칠한 다색은 아직 한 색으로) */
function planOf(t) {
  const n = t.length / 9, col = t.colors, pal = t.palette, parts = t.parts
  const hexOf = (c) => (c && pal && pal[c - 1] ? pal[c - 1].hex : '#c9ced6')
  if (!col || !pal) return { k: 1, tool: null, hexes: ['#c9ced6'], painted: false, many: false, colored: false }
  const first = new Map(), ids = [], area = new Map()
  let painted = false
  for (let i = 0; i < n; i++) {
    const c = col[i] || 0, key = parts ? parts[i] : 0
    if (!first.has(key)) first.set(key, c); else if (first.get(key) !== c) painted = true
    if (!area.has(c)) { area.set(c, 0); ids.push(c) }
    area.set(c, area.get(c) + 1)
  }
  const many = ids.length > MAX_TOOLS
  if (painted || many || ids.length < 2) {
    const top = ids.slice().sort((a, b) => area.get(b) - area.get(a))[0]
    return { k: 1, tool: null, hexes: [hexOf(top)], painted, many, colored: true }
  }
  const idx = new Map(ids.map((c, i) => [c, i])), tool = new Uint8Array(n)
  for (let i = 0; i < n; i++) tool[i] = idx.get(col[i] || 0)
  return { k: ids.length, tool, hexes: ids.map(hexOf), painted: false, many: false, colored: true }
}
/** 바이너리 STL — 가운데(x·y)를 원점에, 바닥을 z 0 에 (엔진이 판 가운데에 놓음) · 압출기마다 삼각형을 모음 */
function toStl(t, plan) {
  const n = t.length / 9
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity
  for (let i = 0; i < t.length; i += 3) { const x = t[i], y = t[i + 1], z = t[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf), counts = new Array(plan.k).fill(0)
  dv.setUint32(80, n, true)
  let w = 84
  for (let g = 0; g < plan.k; g++) {
    for (let f = 0; f < n; f++) {
      if (plan.tool && plan.tool[f] !== g) continue
      const o = f * 9
      w += 12   // 법선은 비움 (엔진이 계산)
      for (let v = 0; v < 3; v++) { dv.setFloat32(w, t[o + v * 3] - cx, true); dv.setFloat32(w + 4, t[o + v * 3 + 1] - cy, true); dv.setFloat32(w + 8, t[o + v * 3 + 2] - z0, true); w += 12 }
      w += 2; counts[g]++
    }
  }
  const splits = []
  let acc = 0
  for (let g = 0; g < plan.k - 1; g++) { acc += counts[g]; splits.push(acc) }
  return { buf, splits, tools: counts.map((_, i) => i), size: [x1 - x0, y1 - y0, (() => { let z1 = -Infinity; for (let i = 2; i < t.length; i += 3) if (t[i] > z1) z1 = t[i]; return z1 - z0 })()] }
}

async function openFile(f, fromZip) {
  S.err = ''; S.msg = ''; S.sent = ''; S.result = null; S.file = f; S.tris = null; S.plan = null; S.thumb = null; S.info = null
  if (!fromZip) S.zip = null
  if (/\.zip$/i.test(f.name)) {   // 0.1.4 자른 조각 모두 (ZIP) 등 — 안의 모델 하나를 고름
    try {
      const list = await unzipModels(await f.arrayBuffer())
      S.file = null
      if (!list.length) S.err = '「' + f.name + '」 안에 STL · 3MF · OBJ 가 없어요.'
      else if (list.length === 1) return openFile(new File([list[0].data], list[0].name), false)
      else S.zip = { name: f.name, list }
    } catch (e) { S.file = null; S.err = 'ZIP 을 풀지 못했어요: ' + ((e && e.message) || e) }
    draw(); return
  }
  draw(); setStatus('📖 「' + f.name + '」 읽는 중…')
  try {
    const t = await PC.read(f.name, await f.arrayBuffer())
    S.tris = t
    S.plan = planOf(t)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let i = 0; i < t.length; i += 3) { if (t[i] < x0) x0 = t[i]; if (t[i] > x1) x1 = t[i]; if (t[i + 1] < y0) y0 = t[i + 1]; if (t[i + 1] > y1) y1 = t[i + 1]; if (t[i + 2] < z0) z0 = t[i + 2]; if (t[i + 2] > z1) z1 = t[i + 2] }
    S.info = { tris: t.length / 9, size: [x1 - x0, y1 - y0, z1 - z0], bodies: t.partList ? t.partList.length : 1 }
    const pal = t.palette, col = t.colors
    S.thumb = renderThumb(t, (fi) => (col && pal && col[fi] && pal[col[fi] - 1] ? pal[col[fi] - 1].hex : null), 512)
    await engineData()
    S.fil = S.plan.hexes.map((h, i) => S.fil[i] || defaultFilament(h))
    S.fil.length = S.plan.k
    setStatus('')
  } catch (e) {
    S.tris = null; S.err = '파일을 읽지 못했어요: ' + (e && e.message ? e.message : e)
  }
  draw()
}

/* ───────── 프린터 라운지 ───────── */
/** 0.1.1 관리자인가 (보내기 단추) */
async function loadMe() {
  try {
    const r = await fetch('/api/plugins/custom-web_slicer/me', { headers: headers(), credentials: 'same-origin', cache: 'no-store' })
    const j = r.ok ? await r.json() : null
    S.admin = !!(j && j.data && j.data.admin)
  } catch (e) { S.admin = false }
}
const canSeeSend = () => !SEND_ADMIN_ONLY || S.admin
async function loadLounge() {
  try {
    const r = await fetch(LOUNGE + '/overview', { headers: headers(), credentials: 'same-origin' })
    if (!r.ok) return
    const j = await r.json(), d = j && j.data
    S.loggedIn = !!(d && d.logged_in)
    S.lounge = d && Array.isArray(d.mine) ? d.mine : []
    const ok = S.lounge.find((p) => p.can_send) || S.lounge[0]
    if (ok && !S.pid) pickLounge(ok.id, true)
  } catch (e) { /* 프린터 라운지가 없거나 꺼짐 — 고르기만 */ }
  draw()
}
function pickLounge(id, quiet) {
  S.pid = +id || 0
  const p = S.lounge.find((x) => +x.id === S.pid)
  if (!p || !ST) return
  const m = matchPreset(p)
  if (m) { S.vendor = m[0]; setPrinter(m[1]) } else if (!quiet) S.msg = '「' + (p.name || '') + '」 와 같은 프린터 설정을 못 찾았어요 — 아래에서 제조사 · 모델을 골라 주세요.'
}
function setPrinter(name) {
  S.printer = name
  S.process = defaultProcess()
  if (S.plan) S.fil = S.plan.hexes.map((h) => defaultFilament(h))
  S.result = null
}
const loungeP = () => S.lounge.find((x) => +x.id === S.pid) || null

/* ───────── 슬라이스 ───────── */
function settingsMap() {
  let s = { ...ST.printerSettings(S.printer) }
  if (S.process) s = ST.applyPreset(s, PROCS.settingsFor(S.process), PROCS.keys)
  const fps = (S.fil.length ? S.fil : ['']).map((nm) => (nm && FILS.settingsFor(nm)) || {})
  s = ST.applyPreset(s, fps[0], FILS.keys)
  if (fps.length > 1) {   // 압출기마다 재료 — 필라멘트 설정은 압출기 순서대로 배열
    for (const key of FILS.keys) {
      const vals = fps.map((p) => scalar(p[key]))
      if (vals.every((v) => v === undefined)) continue
      const d = vals.find((v) => v !== undefined)
      s[key] = vals.map((v) => (v === undefined ? d : v))
    }
  }
  s.filament_colour = S.plan ? S.plan.hexes.slice() : ['#c9ced6']
  s.sparse_infill_density = S.infill + '%'
  s.enable_support = !!S.support
  if (S.support) s.support_type = 'tree(auto)'
  s.brim_type = S.brim ? 'outer_only' : 'no_brim'
  if (S.brim) s.brim_width = 5
  return s
}
async function slice() {
  if (!S.tris || S.busy) return
  S.busy = true; S.prog = 0; S.err = ''; S.msg = ''; S.result = null; draw()
  try {
    await engineData()
    const plan = S.plan, stl = toStl(S.tris, plan), bed = bedSize()
    if (bed && (stl.size[0] > bed[0] + 0.5 || stl.size[1] > bed[1] + 0.5 || stl.size[2] > bed[2] + 0.5)) throw new Error('모델(' + stl.size.map((v) => Math.round(v)).join('×') + 'mm)이 이 프린터 출력 공간(' + bed.map((v) => Math.round(v)).join('×') + 'mm)보다 커요.')
    const s = settingsMap()
    const p = { ...ST.deriveKernelParams(s), gcode_stats_block: true, gcode_config_block: true, gcode_role_tags: true }
    if (plan.k >= 2) Object.assign(p, { extruder_count: plan.k, mm_group_split: stl.splits[0], mm_group_splits: stl.splits, mm_group_tools: stl.tools, wipe_tower_real: true })
    setStatus('⚙️ 슬라이서 엔진 준비 중… (처음 한 번은 몇 MB 를 받아요)')
    if (!client) client = createSlicerClient(new Worker(new URL('./worker.js?v=' + V, import.meta.url), { type: 'module' }))
    const chunks = []
    const t0 = performance.now()
    const r = await client.slice(stl.buf, p, {
      onProgress: (d, t) => { S.prog = t ? d / t : 0; setStatus('🔪 슬라이스 중… ' + Math.round(S.prog * 100) + '%') },
      onLayer: (l) => { if (l.gcode) chunks.push(l.gcode) },
    })
    if (r.error) throw new Error(String(r.error))
    const st = r.stats || {}, warn = r.warnings || []
    if (warn.includes('over_bed_model')) throw new Error('모델이 바닥판 밖으로 나가요 — 더 작은 모델이거나 다른 프린터를 골라 주세요.')
    const mmBy = Array.isArray(st.filament_mm_by_tool) && st.filament_mm_by_tool.length ? st.filament_mm_by_tool : [st.filament_mm || 0]
    const dens = (i) => Number(scalar(Array.isArray(s.filament_density) ? s.filament_density[i] : s.filament_density)) || 1.24
    const tools = mmBy.map((mm, i) => ({ mm, g: mm * Math.PI * 0.875 * 0.875 * dens(i) / 1000, density: dens(i), type: String(scalar(Array.isArray(s.filament_type) ? s.filament_type[i] : s.filament_type) || 'PLA'), color: (plan.hexes[i] || '#c9ced6').toUpperCase() }))
    const bambu = /^Bambu Lab /.test(S.printer)
    const body = chunks.length ? chunks.join('') : String(r.gcode || '')   // 다색 · 실제 압력 평형 경로는 엔진이 층으로 나눠 보내지 않고 한 번에 돌려줌
    if (!body) throw new Error('엔진이 G-code 를 만들지 못했어요.')
    const seconds = st.time_estimate > 0 ? st.time_estimate : estimateSeconds(body, plan.k > 1 ? 50 : 0)   // 다색이면 엔진이 시간을 비워 둠 → G-code 로 어림
    const gcode = (bambu ? bambuHeader({ seconds, layers: st.layers || 0, maxZ: stl.size[2], tools }) : '') + body
    const base = (S.file.name || 'model').replace(/\.(stl|obj|3mf)$/i, '').replace(/\.gcode$/i, '') || 'model'
    const thumb = S.thumb ? await pngBytes(S.thumb) : null
    S.result = {
      gcode, tools, bambu, seconds, guessed: !(st.time_estimate > 0), layers: st.layers || 0, ms: Math.round(performance.now() - t0), base,
      weight: tools.reduce((a, t) => a + t.g, 0),
      gcode3mf: bambu ? buildGcode3mf({ gcode, thumb, seconds, weight: tools.reduce((a, t) => a + t.g, 0), tools, settings: s, printer: S.printer }) : null,
    }
    setStatus('')
  } catch (e) {
    S.err = (e && e.message) || String(e)
    if (/terminated|memory|OOM|out of bounds/i.test(S.err)) { S.err += ' — 메모리가 모자랐을 수 있어요 (큰 모델 · 휴대폰). 컴퓨터에서 해 보세요.'; try { client && client.terminate() } catch (e2) {} client = null }
    setStatus('')
  }
  S.busy = false
  draw()
}

/* ───────── 결과 ───────── */
function download(kind) {
  const R = S.result; if (!R) return
  const blob = kind === '3mf' && R.gcode3mf ? R.gcode3mf : new Blob([R.gcode], { type: 'text/plain' })
  const a = document.createElement('a'), u = URL.createObjectURL(blob)
  a.href = u; a.download = R.base + (kind === '3mf' && R.gcode3mf ? '.gcode.3mf' : '.gcode'); document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(u) }, 1500)
}
function sendDialog() {
  const p = loungeP(), R = S.result
  if (!p || !R || !canSeeSend() || !p.can_send) return
  const kind = p.send_kind || 'bambu', bb = kind === 'bambu'
  const ams = ((p.temps && p.temps.ams) || []).filter((a) => a.slot)
  const rows = bb && ams.length ? R.tools.map((t, i) => {
    let best = ams[0], bd = Infinity
    ams.forEach((a) => { const d = hexDist(t.color, a.color); if (d < bd) { bd = d; best = a } })
    return '<label class="wsl-amsrow"><i style="background:' + esc(t.color) + '"></i><span>' + (R.tools.length > 1 ? (i + 1) + '번 색' : '필라멘트') + ' · ' + esc(t.type) + '</span><select data-ams="' + i + '">' +
      ams.map((a) => '<option value="' + a.slot + '"' + (a === best ? ' selected' : '') + '>AMS ' + a.slot + '번 — ' + esc(a.type || '') + '</option>').join('') +
      (R.tools.length === 1 ? '<option value="ext">외부 스풀</option>' : '') + '</select><b class="wsl-amsdot" data-amsdot="' + i + '"></b></label>'
  }).join('') : ''
  const ov = document.createElement('div'); ov.className = 'wsl-modal'
  ov.innerHTML = '<div class="wsl-dlg" role="dialog" aria-modal="true"><h3>📤 「' + esc(p.name) + '」 로 보내기</h3>' +
    '<p class="wsl-hint">' + (bb ? '.gcode.3mf 를 프린터 라운지에 올리면, 연결 프로그램이 30초쯤 안에 받아 프린터로 올리고 출력을 시작해요.' : '.gcode 를 프린터 라운지에 올리면, 연결 프로그램이 받아 프린터로 올리고 출력을 시작해요.') + '</p>' +
    (rows ? '<div class="wsl-ams"><b>🎨 필라멘트 칸</b>' + rows + '</div>' : '') +
    '<label class="wsl-bed"><input type="checkbox" data-bed> <span>🧹 <b>베드를 비웠어요</b> — 바닥판에 아무것도 없어요 (멀리서 출력 시작은 위험해요)</span></label>' +
    '<div class="wsl-prog" hidden><i></i></div><p class="wsl-dmsg" hidden></p>' +
    '<div class="wsl-acts"><button type="button" class="wsl-btn" data-x>닫기</button><button type="button" class="wsl-btn pri" data-go disabled>📤 보내기</button></div></div>'
  document.body.appendChild(ov)
  const q = (s) => ov.querySelector(s), close = () => ov.remove()
  const dots = () => ov.querySelectorAll('[data-ams]').forEach((sel) => { const a = ams.find((x) => String(x.slot) === sel.value), d = ov.querySelector('[data-amsdot="' + sel.getAttribute('data-ams') + '"]'); if (d) d.style.background = a ? a.color || '#ccc' : 'transparent' })
  dots()
  ov.addEventListener('change', dots)
  q('[data-bed]').onchange = () => { q('[data-go]').disabled = !q('[data-bed]').checked }
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) close() })
  q('[data-go]').onclick = () => {
    const fd = new FormData()
    const blob = bb && R.gcode3mf ? R.gcode3mf : new Blob([R.gcode], { type: 'text/plain' })
    fd.append('file', blob, R.base.replace(/[^\w.-]+/g, '_').slice(0, 60) + (bb && R.gcode3mf ? '.gcode.3mf' : '.gcode'))
    fd.append('bed_clear', '1'); fd.append('plate', '1')
    const sels = ov.querySelectorAll('[data-ams]')
    if (bb && sels.length) {
      if (Array.prototype.some.call(sels, (s) => s.value === 'ext')) fd.append('use_ams', '0')
      else { fd.append('use_ams', '1'); fd.append('ams_map', JSON.stringify(Array.prototype.map.call(sels, (s) => +s.value - 1))) }
    } else fd.append('use_ams', '0')
    const go = q('[data-go]'), pr = q('.wsl-prog'), dm = q('.wsl-dmsg')
    go.disabled = true; go.textContent = '⏳ 올리는 중…'; pr.hidden = false
    const x = new XMLHttpRequest()
    x.open('POST', LOUNGE + '/printers/' + p.id + '/send-file'); x.withCredentials = true
    Object.entries(headers()).forEach(([k, v]) => x.setRequestHeader(k, v))
    const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/); if (m) x.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(m[1]))
    x.upload.onprogress = (e) => { if (e.lengthComputable) pr.firstChild.style.width = Math.round(e.loaded / e.total * 100) + '%' }
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText || '{}') } catch (e) {}
      const ok = x.status >= 200 && x.status < 300 && d.success !== false
      dm.hidden = false; dm.className = 'wsl-dmsg ' + (ok ? 'ok' : 'bad')
      dm.innerHTML = ok ? '✅ ' + esc(d.message || '보냈어요.') + ' <a href="/my-printer">프린터 라운지에서 상태 보기 ›</a>'
        : '⚠️ ' + esc(x.status === 413 ? '파일이 너무 커요 — 서버의 올리기 한도를 넘었어요.' : d.message || (x.status === 401 ? '로그인이 필요해요.' : '보내지 못했어요 (' + x.status + ').'))
      go.textContent = ok ? '✅ 보냄' : '📤 다시 보내기'; go.disabled = ok
      if (ok) {   // 0.1.3 보냈으면 잠깐 보여 주고 창을 닫음 — 화면 위에 「보냈어요」가 남음
        S.sent = '「' + p.name + '」 로 보냈어요 — 연결 프로그램이 30초쯤 안에 받아 출력을 시작해요.'
        setTimeout(() => { close(); draw(); const n = root && root.querySelector('.wsl-sent'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 1200)
      }
    }
    x.onerror = () => { dm.hidden = false; dm.className = 'wsl-dmsg bad'; dm.textContent = '⚠️ 연결이 끊겼어요.'; go.disabled = false; go.textContent = '📤 다시 보내기' }
    x.send(fd)
  }
}

/* ───────── 화면 ───────── */
function setStatus(t) { const el = root && root.querySelector('[data-status]'); if (el) { el.textContent = t; el.hidden = !t } }
function vendorOptions() {
  const tech = (ST && ST.printerTechByVendor) || {}
  const v = ST ? Object.keys(ST.printersByVendor).filter((k) => tech[k] !== 'SLA') : ['BBL']
  return v.sort((a, b) => (a === 'BBL' ? -1 : b === 'BBL' ? 1 : (VENDOR_NAME[a] || a).localeCompare(VENDOR_NAME[b] || b))).map((k) => '<option value="' + esc(k) + '"' + (k === S.vendor ? ' selected' : '') + '>' + esc(VENDOR_NAME[k] || k) + '</option>').join('')
}
function modelOptions() {
  const list = ST && ST.printersByVendor[S.vendor] ? Object.keys(ST.printersByVendor[S.vendor]) : [S.printer]
  return list.map((n) => '<option' + (n === S.printer ? ' selected' : '') + '>' + esc(n) + '</option>').join('')
}
function filSelect(i) {
  const { rec, all } = filamentLists(), cur = S.fil[i] || ''
  const o = (n) => '<option' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>'
  return '<select data-fil="' + i + '">' + (rec.length ? '<optgroup label="이 프린터 추천">' + rec.map(o).join('') + '</optgroup>' : '') + (all.length ? '<optgroup label="전체">' + all.map(o).join('') + '</optgroup>' : '') + '</select>'
}
function draw() {
  if (!root) return
  const I = S.info, P = S.plan, R = S.result, lp = loungeP()
  const procs = ST ? processList() : []
  root.innerHTML = '<div class="wsl">' +
    '<header class="wsl-hero"><div><h1>🔪 웹 슬라이서</h1><p>STL · 3MF 를 이 브라우저에서 슬라이스해 내 프린터로 바로 보내요. 모델은 서버로 올라가지 않아요.</p></div></header>' +
    '<p class="wsl-status" data-status hidden></p>' +
    (S.err ? '<p class="wsl-err">⚠️ ' + esc(S.err) + '</p>' : '') + (S.msg ? '<p class="wsl-note">' + esc(S.msg) + '</p>' : '') +
    (S.sent ? '<p class="wsl-sent">✅ ' + esc(S.sent) + ' <a href="/my-printer">프린터 라운지에서 상태 보기 ›</a><button type="button" data-sent-x aria-label="닫기">✕</button></p>' : '') +
    // 1. 파일
    '<section class="wsl-card"><h2><b>1</b> 모델 파일</h2>' +
      (I ? '<div class="wsl-file"><div class="wsl-thumb" data-thumb></div><div><b title="' + esc(S.file.name) + '">' + esc(S.file.name) + '</b><small>' + n1(I.size[0]) + ' × ' + n1(I.size[1]) + ' × ' + n1(I.size[2]) + ' mm · 삼각형 ' + I.tris.toLocaleString() +
        (I.bodies > 1 ? ' · 물체 ' + I.bodies + '개' : '') + '</small>' +
        (P && P.k > 1 ? '<span class="wsl-sw">' + P.hexes.map((h) => '<i style="background:' + esc(h) + '"></i>').join('') + ' ' + P.k + '색 — 색마다 필라멘트 하나</span>' : '') +
        (P && P.painted ? '<span class="wsl-warn">🎨 칠한 다색은 아직 한 색으로 슬라이스해요 (다음 버전).</span>' : '') +
        (P && P.many ? '<span class="wsl-warn">색이 ' + MAX_TOOLS + '개보다 많아 한 색으로 슬라이스해요.</span>' : '') +
        (I.tris > BIG_TRIS ? '<span class="wsl-warn">삼각형이 많아요 — 휴대폰에서는 메모리가 모자라 멈출 수 있어요.</span>' : '') +
        (S.zip ? '<button type="button" class="wsl-btn sm" data-zipback>📦 ZIP 의 다른 조각</button> ' : '') +
        '<label class="wsl-btn sm">다른 파일<input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick></label></div></div>'
        : S.zip && !S.file ? '<div class="wsl-zip"><p>📦 「' + esc(S.zip.name) + '」 안에 모델이 ' + S.zip.list.length + '개 있어요 — 슬라이스할 것 하나를 고르세요.</p><div class="wsl-chips">' +
          S.zip.list.map((x, i) => '<button type="button" class="wsl-chip" data-zip="' + i + '">' + esc(x.name) + ' <small>' + n1(x.data.length / 1048576) + 'MB</small></button>').join('') +
          '</div><label class="wsl-btn sm">다른 파일<input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick></label></div>'
        : '<label class="wsl-drop" data-drop><input type="file" accept=".stl,.3mf,.obj,.zip" hidden data-pick><b>📂 STL · 3MF 를 끌어 놓거나 눌러서 고르세요</b><small>모델은 이 브라우저에서만 읽어요</small></label>') + '</section>' +
    // 2. 프린터
    '<section class="wsl-card"><h2><b>2</b> 프린터</h2>' +
      (S.lounge.length ? '<div class="wsl-chips">' + S.lounge.map((p) => '<button type="button" class="wsl-chip' + (+p.id === S.pid ? ' on' : '') + '" data-lounge="' + p.id + '">🖨️ ' + esc(p.name) + (p.can_send ? ' <em>📤</em>' : '') + '</button>').join('') + '<button type="button" class="wsl-chip' + (!S.pid ? ' on' : '') + '" data-lounge="0">직접 고르기</button></div>'
        : S.loggedIn ? '<p class="wsl-hint">프린터 라운지에 내 프린터를 등록하면 여기서 바로 고르고 보낼 수 있어요. <a href="/my-printer">프린터 라운지 ›</a></p>' : '<p class="wsl-hint">로그인하면 프린터 라운지의 내 프린터로 바로 보낼 수 있어요.</p>') +
      '<div class="wsl-row"><label>제조사<select data-vendor>' + vendorOptions() + '</select></label><label class="grow">모델<select data-printer>' + modelOptions() + '</select></label></div>' +
      (lp && !lp.can_send ? '<p class="wsl-hint">이 프린터는 지금 보낼 수 없어요 (연결 프로그램이 10분 넘게 소식이 없거나, 보내기를 지원하지 않는 연결). 내려받아서 쓰세요.</p>' : '') + '</section>' +
    // 3. 설정
    '<section class="wsl-card"><h2><b>3</b> 설정</h2>' +
      '<label>품질 (층 높이)<div class="wsl-chips">' + (procs.length ? procs.map((n) => '<button type="button" class="wsl-chip sm' + (n === S.process ? ' on' : '') + '" data-proc="' + esc(n) + '">' + esc(n.replace(/\s*@.*$/, '')) + '</button>').join('') : '<span class="wsl-hint">불러오는 중…</span>') + '</div></label>' +
      '<div class="wsl-fils"><b>필라멘트</b>' + (ST && FILS ? (P ? P.hexes : ['#c9ced6']).map((h, i) => '<div class="wsl-fil">' + (P && P.colored ? '<span class="wsl-mc" title="모델 파일에 적힌 색 — 이 색 자리에 쓸 필라멘트를 오른쪽에서 고르세요"><i style="background:' + esc(h) + '"></i>' + (P.k > 1 ? (i + 1) + '번 색' : '모델 색') + '</span>' : '') + filSelect(i) + '</div>').join('') : '<span class="wsl-hint">불러오는 중…</span>') + '</div>' +
      '<div class="wsl-row"><label>채우기<select data-infill>' + [5, 10, 15, 20, 25, 30, 40, 50, 100].map((v) => '<option value="' + v + '"' + (v === S.infill ? ' selected' : '') + '>' + v + '%</option>').join('') + '</select></label>' +
        '<label class="wsl-tg"><input type="checkbox" data-support' + (S.support ? ' checked' : '') + '> 서포트 (나무 모양 · 자동)</label><label class="wsl-tg"><input type="checkbox" data-brim' + (S.brim ? ' checked' : '') + '> 브림 (바닥 테두리)</label></div>' +
      '<button type="button" class="wsl-btn pri big" data-slice' + (!S.tris || S.busy ? ' disabled' : '') + '>' + (S.busy ? '⏳ 슬라이스 중…' : '🔪 슬라이스') + '</button>' +
      (S.busy ? '<div class="wsl-prog"><i style="width:' + Math.round(S.prog * 100) + '%"></i></div>' : '') + '</section>' +
    // 4. 결과
    (R ? '<section class="wsl-card wsl-res"><h2><b>4</b> 결과</h2><div class="wsl-tiles">' +
      '<div><small>예상 시간' + (R.guessed ? ' (어림)' : '') + '</small><b>' + dur(R.seconds) + '</b></div><div><small>필라멘트</small><b>' + n1(R.weight) + ' g</b></div><div><small>층</small><b>' + R.layers.toLocaleString() + '</b></div><div><small>슬라이스</small><b>' + n1(R.ms / 1000) + '초</b></div></div>' +
      (R.tools.length > 1 ? '<div class="wsl-tools">' + R.tools.map((t, i) => '<span><i style="background:' + esc(t.color) + '"></i>' + (i + 1) + '번 ' + n1(t.g) + ' g</span>').join('') + '<small>색 바꿀 때 버리는 양(프라임 타워)이 포함돼요.</small></div>' : '') +
      '<div class="wsl-acts">' + (lp && canSeeSend() ? '<button type="button" class="wsl-btn pri" data-send' + (lp.can_send ? '' : ' disabled title="이 프린터는 지금 보낼 수 없어요"') + '>📤 「' + esc(lp.name) + '」 로 보내기' + (SEND_ADMIN_ONLY ? ' <small class="wsl-adm">🔒 관리자 시험</small>' : '') + '</button>' : '') +
      (R.gcode3mf ? '<button type="button" class="wsl-btn" data-dl="3mf">⬇️ .gcode.3mf 내려받기</button>' : '') + '<button type="button" class="wsl-btn" data-dl="gcode">⬇️ .gcode 내려받기</button></div>' +
      (lp && canSeeSend() && !lp.can_send ? '<p class="wsl-hint">📤 「' + esc(lp.name) + '」 는 지금 보낼 수 없어요 — 프린터 라운지 연결 프로그램이 10분 안에 소식을 보내야 하고, 관리자 설정 「출력 파일 보내기」가 켜져 있어야 해요. <a href="/my-printer">프린터 라운지 ›</a></p>' : '') +
      (SEND_ADMIN_ONLY && S.admin ? '<p class="wsl-hint">🔒 보내기는 시험하는 동안 <b>관리자에게만</b> 보여요. 회원에게는 내려받기만 보여요.</p>' : '') +
      '<p class="wsl-hint">예상 시간 · 무게는 엔진 계산이라 실제와 조금 다를 수 있어요. 처음 쓰는 프린터는 첫 층을 지켜봐 주세요.</p></section>' : '') +
    '<footer class="wsl-foot">이 슬라이서는 <b>AGPL-3.0</b> 오픈소스예요 — <a href="' + SRC + '" target="_blank" rel="noopener">소스 보기</a> · 엔진 <a href="https://github.com/kimgh06/Three_Slicer" target="_blank" rel="noopener">three-slicer</a> (OrcaSlicer 를 브라우저로 옮긴 것). 품질은 Bambu Studio · OrcaSlicer 와 조금 다를 수 있어요.</footer>' +
    '</div>'
  const th = root.querySelector('[data-thumb]'); if (th && S.thumb) { S.thumb.className = 'wsl-cv'; th.appendChild(S.thumb) }
}
function bind() {
  root.addEventListener('change', (e) => {
    const t = e.target
    if (t.matches('[data-pick]') && t.files && t.files[0]) openFile(t.files[0])
    else if (t.matches('[data-vendor]')) { S.vendor = t.value; const first = Object.keys(ST.printersByVendor[S.vendor] || {}); setPrinter(first.find((n) => / 0\.4 nozzle$/.test(n)) || first[0]); S.pid = 0; draw() }
    else if (t.matches('[data-printer]')) { setPrinter(t.value); S.pid = 0; draw() }
    else if (t.matches('[data-fil]')) { S.fil[+t.getAttribute('data-fil')] = t.value; S.result = null; draw() }
    else if (t.matches('[data-infill]')) { S.infill = +t.value; S.result = null; draw() }
    else if (t.matches('[data-support]')) { S.support = t.checked; S.result = null; draw() }
    else if (t.matches('[data-brim]')) { S.brim = t.checked; S.result = null; draw() }
  })
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return
    if (b.hasAttribute('data-lounge')) { S.msg = ''; if (+b.getAttribute('data-lounge')) pickLounge(b.getAttribute('data-lounge')); else S.pid = 0; draw() }
    else if (b.hasAttribute('data-proc')) { S.process = b.getAttribute('data-proc'); S.result = null; draw() }
    else if (b.hasAttribute('data-slice')) slice()
    else if (b.hasAttribute('data-dl')) download(b.getAttribute('data-dl'))
    else if (b.hasAttribute('data-send')) sendDialog()
    else if (b.hasAttribute('data-sent-x')) { S.sent = ''; draw() }
    else if (b.hasAttribute('data-zip')) { const x = S.zip && S.zip.list[+b.getAttribute('data-zip')]; if (x) openFile(new File([x.data], x.name), true) }
    else if (b.hasAttribute('data-zipback')) { S.file = null; S.tris = null; S.info = null; S.plan = null; S.result = null; draw() }
  })
  root.addEventListener('dragover', (e) => { if (e.target.closest('[data-drop]')) { e.preventDefault(); e.target.closest('[data-drop]').classList.add('over') } })
  root.addEventListener('dragleave', (e) => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over') })
  root.addEventListener('drop', (e) => { const d = e.target.closest('[data-drop]'); if (!d) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) openFile(f) })
}

function mount() {
  const el = document.querySelector('[data-wsl-app]')
  if (!el || el.__wsl) return
  el.__wsl = true; root = el
  bind(); draw()
  handoff()
  loadMe().then(draw)
  engineData().then(() => { if (!S.process) S.process = defaultProcess(); if (!S.fil.length) S.fil = [defaultFilament()]; draw(); return loadLounge() })
    .catch((e) => { S.err = '슬라이서 설정을 불러오지 못했어요: ' + ((e && e.message) || e); draw() })
}
/* ───────── 0.1.4 다른 화면에서 넘겨받은 파일 (/slicer?handoff=열쇠) ───────── */
async function handoff() {
  let key = ''
  try { key = new URLSearchParams(location.search).get('handoff') || '' } catch (e) {}
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(key)) return
  S.msg = '📨 다른 화면에서 보낸 파일을 기다리는 중… (파일을 만드는 데 조금 걸릴 수 있어요)'; draw()
  for (let i = 0; i < 180; i++) {
    let v = null
    try { v = await takeHandoff(key) } catch (e) { break }
    if (v) {
      S.msg = ''
      try { history.replaceState(history.state, '', location.pathname) } catch (e) {}
      if (v.error || !v.blob) { S.err = v.error || '파일을 넘겨받지 못했어요.'; draw(); return }
      await openFile(new File([v.blob], v.name || 'model.stl', { type: v.blob.type || '' }))
      return
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  S.msg = ''; S.err = '넘겨받을 파일이 오지 않았어요 — 원래 화면에서 파일을 받아 여기에 끌어 놓아 주세요.'; draw()
}
window.__wslApp = { tick: mount, version: V }
mount()
