/** Utilidades para pintar fondos de tablero y portadas de tarjeta (predefinidos o con imagen). */
import { isYoutubeLink } from './links.js'

const cssUrl = (url) => `url("${String(url).replace(/["\\]/g, '')}")`

export const isCustomImage = (value) => typeof value === 'string' && value.trim() !== ''

/** Fondo de la página del tablero: imagen propia o degradado predefinido. */
export function boardArtwork(board) {
  if (!board) return { className: 'bg-aurora', style: undefined }
  if (isCustomImage(board.backgroundImage)) {
    return {
      className: 'bg-custom',
      style: {
        backgroundImage: `linear-gradient(180deg, rgba(8, 11, 18, 0.55), rgba(8, 11, 18, 0.82)), ${cssUrl(
          board.backgroundImage
        )}`,
      },
    }
  }
  return { className: `bg-${board.background || 'aurora'}`, style: undefined }
}

/** Miniatura del tablero en la lista de tableros (misma imagen, velo más ligero). */
export function boardTileArtwork(board) {
  if (!board) return { className: 'bg-aurora', style: undefined }
  if (isCustomImage(board.backgroundImage)) {
    return {
      className: 'bg-custom tile-custom',
      style: {
        backgroundImage: `linear-gradient(160deg, rgba(8, 11, 18, 0.2) 20%, rgba(8, 11, 18, 0.78) 100%), ${cssUrl(
          board.backgroundImage
        )}`,
      },
    }
  }
  return { className: `bg-${board.background || 'aurora'}`, style: undefined }
}

/** Posiciones de encuadre que puede elegir el usuario para la portada. */
export const COVER_POSITION_OPTIONS = [
  { value: 'top-left', label: 'Arriba izquierda' },
  { value: 'top', label: 'Arriba' },
  { value: 'top-right', label: 'Arriba derecha' },
  { value: 'left', label: 'Izquierda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Derecha' },
  { value: 'bottom-left', label: 'Abajo izquierda' },
  { value: 'bottom', label: 'Abajo' },
  { value: 'bottom-right', label: 'Abajo derecha' },
]

const COVER_POSITION_CSS = {
  center: 'center',
  top: '50% 0%',
  bottom: '50% 100%',
  left: '0% 50%',
  right: '100% 50%',
  'top-left': '0% 0%',
  'top-right': '100% 0%',
  'bottom-left': '0% 100%',
  'bottom-right': '100% 100%',
}

/** Estilo de la portada de una tarjeta cuando es una imagen; null si es color o no tiene. */
export function coverImageStyle(card) {
  if (!isCustomImage(card?.coverImage)) return null
  return {
    backgroundImage: cssUrl(card.coverImage),
    backgroundSize: 'cover',
    backgroundPosition: COVER_POSITION_CSS[card?.coverPosition] || 'center',
  }
}

/**
 * Portada visible de la tarjeta: la imagen propia y el color mandan; si no hay
 * ninguno y el enlace es de YouTube, se usa la miniatura del vídeo.
 */
export function cardCover(card) {
  const style = coverImageStyle(card)
  if (style) return { kind: 'image', style }
  if (card?.coverColor) return { kind: 'color', color: card.coverColor }
  if (isYoutubeLink(card?.link?.url) && isCustomImage(card?.link?.image)) {
    return {
      kind: 'image',
      style: {
        backgroundImage: cssUrl(card.link.image),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
    }
  }
  return null
}
