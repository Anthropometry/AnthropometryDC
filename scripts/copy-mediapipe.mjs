// Copies the MediaPipe face-detector runtime (SIMD build) from node_modules into public/mediapipe/,
// so the app serves it itself (self-hosted; works offline; no request to Google at run time).
// Run automatically before dev and build. The copied files are git-ignored (they come from npm).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const to = join(root, 'public', 'mediapipe')
mkdirSync(to, { recursive: true })
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) copyFileSync(join(from, f), join(to, f))
console.log('MediaPipe runtime copied to public/mediapipe/')
