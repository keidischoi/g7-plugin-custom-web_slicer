// custom-web_slicer — 화면 · 엔진 묶기: npm run build → dist/web/ (app.js · worker.js · c-<해시>.js 조각 · app.css)
//  화면(app.js)과 worker 는 따로 진입점 · 공통 조각은 c-<해시>.js 로 나눠 길게 캐시 (AssetController)
import { build } from 'esbuild'
import { cpSync, rmSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'dist/web')
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })
await build({
  entryPoints: { app: join(root, 'web/src/app.js'), worker: join(root, 'web/src/worker.js') },
  bundle: true, splitting: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'eof', platform: 'browser',
  external: ['node:*'],          // 엔진의 node 전용 갈래 (브라우저에서는 안 탐)
  ignoreAnnotations: true,       // three-slicer 는 sideEffects:false — worker 진입점(import 만 함)이 빠지지 않게
  outdir: out, entryNames: '[name]', chunkNames: 'c-[hash]', loader: { '.json': 'json' },
  logLevel: 'warning', charset: 'utf8',
})
cpSync(join(root, 'web/src/app.css'), join(out, 'app.css'))
cpSync(join(root, 'node_modules/three-slicer/LICENSE.txt'), join(out, 'three-slicer-LICENSE.txt'))
cpSync(join(root, 'node_modules/three-slicer/THIRD-PARTY-NOTICES.md'), join(out, 'three-slicer-NOTICES.txt'))
const files = readdirSync(out).map((f) => [f, statSync(join(out, f)).size])
writeFileSync(join(out, 'files.txt'), files.map(([f, s]) => f + '\t' + s).join('\n') + '\n')
console.log(files.map(([f, s]) => f.padEnd(28) + (s / 1048576).toFixed(2) + ' MB').join('\n'))
