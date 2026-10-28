import test from 'node:test'
import assert from 'node:assert/strict'
import { isYoutubeLink, linkHost, youtubeVideoId } from '../src/lib/links.js'
import { cardCover } from '../src/lib/backgrounds.js'

test('detecta los formatos habituales de YouTube', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(youtubeVideoId('https://vimeo.com/123456'), null)
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=corto'), null)
  assert.equal(youtubeVideoId(null), null)
  assert.equal(isYoutubeLink('https://ejemplo.com/video'), false)
  assert.equal(isYoutubeLink('https://youtu.be/dQw4w9WgXcQ'), true)
})

test('la portada prefiere la imagen y el color propios antes que la miniatura del enlace', () => {
  const link = {
    url: 'https://youtu.be/dQw4w9WgXcQ',
    image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  }

  assert.deepEqual(cardCover({ link }), {
    kind: 'image',
    style: {
      backgroundImage: 'url("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    },
  })
  assert.equal(cardCover({ link, coverColor: 'purple' }).kind, 'color')
  assert.equal(cardCover({ link, coverImage: '/uploads/a.png' }).kind, 'image')
  assert.equal(cardCover({}), null)
  assert.equal(cardCover({ link: { ...link, image: null } }), null)
  assert.equal(
    cardCover({ link: { url: 'https://ejemplo.com/articulo', image: 'https://ejemplo.com/p.jpg' } }),
    null,
    'la miniatura de un enlace normal no sustituye la portada'
  )
})

test('linkHost muestra el dominio sin www', () => {
  assert.equal(linkHost('https://www.ejemplo.com/a'), 'ejemplo.com')
  assert.equal(linkHost('no es una url'), '')
})
