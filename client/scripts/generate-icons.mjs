/**
 * Genera los iconos PNG de la app a partir del máster de marca
 * `brand/app-icon-1024.jpg` (el render del isotipo de Utrel).
 *
 *   npm run icons --workspace client
 *
 * Necesita ImageMagick (`magick`, o `convert` en la versión 6). El icono normal
 * recorta el 75 % central del máster para que el dibujo llene el icono como en
 * cualquier app; el «maskable» deja más aire (90 %) porque Android recorta
 * hasta un 20 % del borde.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const source = path.join(root, 'brand/app-icon-1024.jpg')
const outDir = path.resolve(here, '../public/icons')

/** `magick` en ImageMagick 7, `convert` en la 6. */
function findImageMagick() {
  for (const binary of ['magick', 'convert']) {
    try {
      execFileSync(binary, ['-version'], { stdio: 'ignore' })
      return binary
    } catch {
      /* siguiente candidato */
    }
  }
  throw new Error('No encuentro ImageMagick (`magick` o `convert`) en el PATH')
}

if (!fs.existsSync(source)) {
  throw new Error(`Falta el máster de marca: ${path.relative(root, source)}`)
}

const magick = findImageMagick()
fs.mkdirSync(outDir, { recursive: true })

// [fichero, lado en píxeles, parte del máster que se conserva]
const outputs = [
  ['icon-192.png', 192, 0.75],
  ['icon-512.png', 512, 0.75],
  ['apple-touch-icon.png', 180, 0.75],
  ['icon-maskable-512.png', 512, 0.9],
]

for (const [name, size, keep] of outputs) {
  const file = path.join(outDir, name)
  const side = Math.round(1024 * keep)
  execFileSync(magick, [
    source,
    '-gravity',
    'center',
    '-crop',
    `${side}x${side}+0+0`,
    '+repage',
    '-resize',
    `${size}x${size}`,
    `PNG32:${file}`,
  ])
  console.log(`${name} — ${size}x${size} (${fs.statSync(file).size} bytes)`)
}
