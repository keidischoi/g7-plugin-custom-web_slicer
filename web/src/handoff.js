/*! custom-web_slicer — 다른 화면에서 넘겨받은 파일 (0.1.4) · AGPL-3.0-or-later
 *  다른 확장의 받기 단추 옆 「🖨️ 프린터로 보내기」(plugin.iife.js) 가 만든 파일을 이 사이트의 IndexedDB 에 잠깐 두면
 *  /slicer?handoff=<열쇠> 화면이 꺼내 바로 엶 (서버로는 안 감). 꺼내면 지움 · 1시간 넘은 것도 지움.
 *  ZIP(자른 조각 모두 등)은 안의 STL · 3MF · OBJ 를 풀어 하나를 고르게 함 */
export const HANDOFF_DB = 'wsl-handoff', HANDOFF_STORE = 'files'
export const MODEL_RE = /\.(stl|3mf|obj)$/i

function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(HANDOFF_DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(HANDOFF_STORE)) r.result.createObjectStore(HANDOFF_STORE) }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  })
}

/** 열쇠의 파일을 꺼내고 지움 (없으면 null) — 1시간 넘게 남은 것도 같이 지움 */
export async function takeHandoff(key) {
  const db = await idb()
  try {
    return await new Promise((ok, no) => {
      const tx = db.transaction(HANDOFF_STORE, 'readwrite'), st = tx.objectStore(HANDOFF_STORE)
      let found = null
      const g = st.get(key)
      g.onsuccess = () => { found = g.result || null; if (found) st.delete(key) }
      const c = st.openCursor()
      c.onsuccess = () => { const cur = c.result; if (!cur) return; if (!(cur.value && cur.value.at > Date.now() - 3600e3)) cur.delete(); cur.continue() }
      tx.oncomplete = () => ok(found)
      tx.onerror = () => no(tx.error)
    })
  } finally { db.close() }
}

/** ZIP 안의 모델 파일들 [{name, data: Uint8Array}] — 저장(0) · deflate(8) 만 (ZIP64 · 암호는 못 읽음) */
export async function unzipModels(buf) {
  const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), td = new TextDecoder()
  let e = -1
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break }
  if (e < 0) throw new Error('ZIP 파일이 아니에요')
  const n = dv.getUint16(e + 10, true), out = []
  let p = dv.getUint32(e + 16, true)
  for (let k = 0; k < n; k++) {
    if (p + 46 > u.length || dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true)
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true)
    const name = td.decode(u.subarray(p + 46, p + 46 + nl))
    p += 46 + nl + xl + cl
    const base = name.split('/').pop()
    if (!MODEL_RE.test(base) || /^__MACOSX\//.test(name) || base.startsWith('.')) continue
    if (lo + 30 > u.length || dv.getUint32(lo, true) !== 0x04034b50) continue
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u.subarray(start, start + csize)
    let data = null
    if (method === 0) data = raw.slice()
    else if (method === 8 && typeof DecompressionStream === 'function') {
      data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
    }
    if (data) out.push({ name: base, data })
  }
  return out
}
