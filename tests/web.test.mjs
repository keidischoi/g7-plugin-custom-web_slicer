// 웹 슬라이서 계산 검사 — node tests/web.test.mjs
//  .gcode.3mf (zip · md5 · 프린터 라운지가 찾는 plate_1.gcode) · 머리말 · 엔진으로 큐브 슬라이스 (A1 · 한 색 / 두 색)
import { createHash } from 'node:crypto'
import { crc32 as zcrc } from 'node:zlib'
import { buildGcode3mf, bambuHeader, md5hex, crc32 } from '../web/src/gcode3mf.js'
import { unzipModels } from '../web/src/handoff.js'
import { deflateRawSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m) }

// md5 · crc32 — node 와 같은 값
for (const s of ['', 'a', 'abc', 'x'.repeat(1000), '한글 G1 X10 Y20\n'.repeat(500)]) {
  const u = new TextEncoder().encode(s)
  ok(md5hex(u) === createHash('md5').update(u).digest('hex').toUpperCase() && (!zcrc || crc32(u) === zcrc(u)), 'md5 · crc32 = node (' + s.length + '자)')
}

// .gcode.3mf 구조
const gcode = bambuHeader({ seconds: 3725, layers: 50, maxZ: 10, tools: [{ mm: 1000, g: 2.98, density: 1.24 }] }) + 'G28\nG1 X10 Y10 F3000\n'
const blob = buildGcode3mf({ gcode, thumb: new Uint8Array([137, 80, 78, 71]), seconds: 3725, weight: 2.98, tools: [{ type: 'PLA', color: '#FF0000', mm: 1000, g: 2.98 }], settings: { a: 1 } })
const z = Buffer.from(await blob.arrayBuffer())
let e = z.length - 22; while (e > 0 && z.readUInt32LE(e) !== 0x06054b50) e--
const files = {}
let p = z.readUInt32LE(e + 16)
for (let i = 0; i < z.readUInt16LE(e + 10); i++) {
  const nl = z.readUInt16LE(p + 28), off = z.readUInt32LE(p + 42), sz = z.readUInt32LE(p + 20), name = z.slice(p + 46, p + 46 + nl).toString()
  files[name] = z.slice(off + 30 + z.readUInt16LE(off + 26) + z.readUInt16LE(off + 28), off + 30 + z.readUInt16LE(off + 26) + z.readUInt16LE(off + 28) + sz)
  p += 46 + nl + z.readUInt16LE(p + 30) + z.readUInt16LE(p + 32)
}
ok(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/plate_1.gcode', 'Metadata/plate_1.gcode.md5', 'Metadata/plate_1.png', 'Metadata/model_settings.config', 'Metadata/slice_info.config', 'Metadata/project_settings.config'].every((k) => files[k]), '.gcode.3mf 안의 파일 (Bambu 꼴)')
ok(files['Metadata/plate_1.gcode'].toString() === gcode && files['Metadata/plate_1.gcode.md5'].toString() === createHash('md5').update(gcode).digest('hex').toUpperCase(), 'plate_1.gcode 그대로 · md5 맞음')
ok(/^Metadata\/plate_(\d+)\.gcode$/.test('Metadata/plate_1.gcode') && files['Metadata/slice_info.config'].toString().includes('used_g="2.98"') && files['Metadata/slice_info.config'].toString().includes('prediction" value="3725"'), 'slice_info: 예상 시간 · 쓴 양 (프린터 라운지 · Bambu 가 읽는 자리)')
ok(gcode.startsWith('; HEADER_BLOCK_START') && gcode.includes('; model printing time: 1h 2m 5s') && gcode.includes('; total layer number: 50') && gcode.includes('; HEADER_BLOCK_END'), 'Bambu 머리말 (시간 · 층)')

// 엔진으로 슬라이스 (node 에서도 같은 엔진)
const { createSlicer } = await import('three-slicer')
const ST = await import('three-slicer/settings')
const cube = (x0, w, h) => { const v = [[0, 0, 0], [w, 0, 0], [w, w, 0], [0, w, 0], [0, 0, h], [w, 0, h], [w, w, h], [0, w, h]].map((q) => [q[0] + x0, q[1] - w / 2, q[2]]); return [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]].map((t) => t.map((i) => v[i])) }
const stl = (tris) => { const b = Buffer.alloc(84 + tris.length * 50); b.writeUInt32LE(tris.length, 80); tris.forEach((t, i) => t.forEach((q, k) => q.forEach((c, j) => b.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + j * 4)))); return b }
const procs = await ST.processPresets(), fils = await ST.filamentPresets(), name = 'Bambu Lab A1 0.4 nozzle'
let s = { ...ST.printerSettings(name) }
s = ST.applyPreset(s, procs.settingsFor(ST.printersByVendor.BBL[name][3]), procs.keys)
s = ST.applyPreset(s, fils.settingsFor('Bambu PLA Basic @BBL A1'), fils.keys)
s.sparse_infill_density = '15%'
const base = { ...ST.deriveKernelParams(s), gcode_stats_block: true, gcode_config_block: true, gcode_role_tags: true }
const sl = await createSlicer()
const r1 = sl.slice(stl(cube(-10, 20, 10)), base)
ok(!r1.error && r1.stats.layers === 50 && r1.gcode.includes('machine_start_gcode') && /M620/.test(r1.gcode) && r1.stats.time_estimate > 60, 'A1 한 색 큐브: 50층 · A1 시작 G-code · 예상 시간')
const r2 = sl.slice(stl([...cube(-25, 10, 6), ...cube(5, 10, 6)]), { ...base, extruder_count: 2, mm_group_split: 12, mm_group_splits: [12], mm_group_tools: [0, 1], wipe_tower_real: true })
ok(!r2.error && Array.isArray(r2.stats.filament_mm_by_tool) && r2.stats.filament_mm_by_tool.length === 2 && /\nT1\b/.test(r2.gcode) && (r2.gcode.match(/M620 S\d/g) || []).length > 2, 'A1 두 색 (물체마다 압출기): T1 · AMS 바꿈 · 압출기마다 쓴 양')
ok(!(r2.stats.time_estimate > 0), '두 색이면 엔진이 예상 시간을 비움 → 화면이 G-code 로 어림 (estimateSeconds)')
sl.dispose()

// 0.1.4 넘겨받은 ZIP (자른 조각 모두 등) — 저장 · deflate 둘 다, 모델만 (README · __MACOSX 빼고)
{
  const ents = [['a.stl', 'solid a\nendsolid a\n', 0], ['b/조각2.STL', 'solid b\n'.repeat(200), 8], ['readme.txt', 'x', 0], ['__MACOSX/._a.stl', 'm', 0], ['c.3mf', 'PK-fake', 8]]
  const parts = [], cen = []; let off = 0
  for (const [n, txt, m] of ents) {
    const name = Buffer.from(n), raw = Buffer.from(txt), data = m ? deflateRawSync(raw) : raw
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(m, 8); lh.writeUInt32LE(zcrc(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26)
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(m, 10); ch.writeUInt32LE(zcrc(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42)
    parts.push(lh, name, data); cen.push(ch, name); off += 30 + name.length + data.length
  }
  const cd = Buffer.concat(cen), eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(ents.length, 8); eo.writeUInt16LE(ents.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16)
  const list = await unzipModels(Buffer.concat([...parts, cd, eo]))
  ok(list.map((x) => x.name).join('|') === 'a.stl|조각2.STL|c.3mf' && new TextDecoder().decode(list[1].data) === 'solid b\n'.repeat(200) && new TextDecoder().decode(list[0].data).startsWith('solid a'), 'ZIP 풀기: 저장 · deflate · 모델만 (' + list.length + '개)')
  let bad = ''; try { await unzipModels(new Uint8Array(100)) } catch (e) { bad = e.message }
  ok(bad === 'ZIP 파일이 아니에요', 'ZIP 이 아니면 알림')
}
// 0.1.4 받기 단추 옆 「프린터로 보내기」 (불러오기 plugin.iife.js) · 넘겨받기 (app.js)
{
  const ld = readFileSync(new URL('../resources/js/web_slicer.js', import.meta.url), 'utf8'), app = readFileSync(new URL('../web/src/app.js', import.meta.url), 'utf8')
  ok(ld === readFileSync(new URL('../dist/js/plugin.iife.js', import.meta.url), 'utf8') && ld.includes("[data-wsl-send]:not([data-wsl-sent])") && ld.includes("'/slicer?handoff=' + key") && ld.includes("a.setAttribute('data-cls-taken', '1')")
    && ld.includes('var SEND_ADMIN_ONLY = true') && app.includes('const SEND_ADMIN_ONLY = true') && app.includes("get('handoff')") && app.includes('takeHandoff(key)') && /accept="\.stl,\.3mf,\.obj,\.zip"/.test(app),
  '받기 단추 옆 단추 · 새 탭 /slicer?handoff= · 내려받기 대신 넘김 · 관리자 시험 (두 곳 같이) · ZIP 고르기')
}
console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' : 'OK ') + (pass + fail))
process.exit(fail ? 1 : 0)
