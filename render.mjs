// Captures lower-third.html frame by frame on a transparent background,
// through one headless Chrome (DevTools protocol), then encodes each variant
// to ProRes 4444 with alpha using encode.swift.
//
//   node render.mjs                 every variant, 30 fps, 7 s
//   node render.mjs intro why       just these
//
// Output: out/gettomass-lower-third-<variant>.mov
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FPS = 30
const DURATION = 7
const VARIANTS = process.argv.slice(2).length ? process.argv.slice(2) : ['intro', 'why', 'cta']
const OUT = join(HERE, 'out')
mkdirSync(OUT, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'lt-chrome-'))
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))
let port
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100)
  const f = join(profile, 'DevToolsActivePort')
  if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]
}
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))

let id = 0
const waiting = new Map()
const events = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) } else events.push(m)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id
  waiting.set(n, m => m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result))
  ws.send(JSON.stringify({ id: n, method, params }))
})

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })

for (const v of VARIANTS) {
  const frames = join(tmpdir(), `lt-frames-${v}`)
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(frames)
  const url = pathToFileURL(join(HERE, 'lower-third.html')).href + `?v=${v}&d=${DURATION}&t=0`
  events.length = 0
  await send('Page.navigate', { url })
  while (!events.some(e => e.method === 'Page.loadEventFired')) await sleep(20)
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => document.fonts.check("600 56px Outfit"))', awaitPromise: true })

  const total = FPS * DURATION
  for (let f = 0; f < total; f++) {
    await send('Runtime.evaluate', { expression: `setT(${f / FPS})` })
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(frames, `${String(f).padStart(4, '0')}.png`), Buffer.from(data, 'base64'))
  }
  const mov = join(OUT, `gettomass-lower-third-${v}.mov`)
  execFileSync('swift', [join(HERE, 'encode.swift'), frames, mov, String(FPS)], { stdio: 'inherit' })
  rmSync(frames, { recursive: true, force: true })
}

ws.close()
chrome.kill()
rmSync(profile, { recursive: true, force: true })
