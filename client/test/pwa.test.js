import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../dist')
const skip = fs.existsSync(dist) ? false : 'ejecuta `npm run build` en client/ antes de esta prueba'

/** Dimensiones y validez de un PNG leído de disco, sin dependencias. */
function pngInfo(file) {
  const buffer = fs.readFileSync(file)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const valid = buffer.subarray(0, 8).equals(signature)
  return {
    valid,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
    bytes: buffer.length,
  }
}

test('el HTML servido declara la app instalable', { skip }, () => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/)
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/)
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/)
  assert.match(html, /name="apple-mobile-web-app-title" content="Utrel"/)
  assert.match(html, /name="theme-color" content="#10141d"/)
  assert.match(html, /viewport-fit=cover/)
  assert.match(html, /rel="icon" href="\/favicon\.svg"/)
})

test('el manifest trae pantalla completa e iconos válidos', { skip }, () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'))
  assert.equal(manifest.name, 'Utrel')
  assert.equal(manifest.short_name, 'Utrel')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.background_color, '#10141d')
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'))

  for (const icon of manifest.icons) {
    const file = path.join(dist, icon.src.replace(/^\//, ''))
    assert.ok(fs.existsSync(file), `falta el icono ${icon.src}`)
    const info = pngInfo(file)
    assert.ok(info.valid, `${icon.src} no es un PNG válido`)
    assert.equal(info.colorType, 6, `${icon.src} debería ser RGBA`)
    assert.equal(`${info.width}x${info.height}`, icon.sizes, `${icon.src} no mide ${icon.sizes}`)
  }
})

test('el icono de iPad y el favicon existen', { skip }, () => {
  const apple = pngInfo(path.join(dist, 'icons/apple-touch-icon.png'))
  assert.ok(apple.valid)
  assert.equal(apple.width, 180)
  assert.equal(apple.height, 180)
  assert.ok(apple.bytes > 500, 'el icono no puede estar vacío')

  const favicon = fs.readFileSync(path.join(dist, 'favicon.svg'), 'utf8')
  assert.match(favicon, /<svg/)
  assert.match(favicon, /role="img" aria-label="Utrel"/)
  assert.match(favicon, /url\(#utrel-bg\)/, 'el favicon usa el degradado de la identidad')
})

test('el isotipo de la marca se sirve junto a la app', { skip }, () => {
  const mark = fs.readFileSync(path.join(dist, 'brand/utrel-mark.svg'), 'utf8')
  assert.match(mark, /<svg/)
  assert.match(mark, /viewBox="0 0 512 512"/, 'el isotipo es el del kit de marca')
  assert.match(mark, /url\(#icon-bg\)/, 'el isotipo usa el degradado de la identidad')
})

test('el service worker sirve el armazón y nunca la API', { skip }, () => {
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
  assert.match(sw, /addEventListener\('install'/)
  assert.match(sw, /addEventListener\('activate'/)
  assert.match(sw, /addEventListener\('fetch'/)
  assert.match(sw, /'\/',\s*'\/index\.html'/, 'precachea el armazón')
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)[\s\S]{0,80}return/, 'la API va siempre a la red')
  assert.match(sw, /url\.pathname\.startsWith\('\/uploads\/'\)/)
  assert.match(sw, /request\.mode === 'navigate'/, 'la navegación va a la red con respaldo local')
})
