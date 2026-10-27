/** Utilidades para pintar fondos de tablero y portadas de tarjeta (predefinidos o con imagen). */

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

/** Estilo de la portada de una tarjeta cuando es una imagen; null si es color o no tiene. */
export function coverImageStyle(card) {
  if (!isCustomImage(card?.coverImage)) return null
  return {
    backgroundImage: cssUrl(card.coverImage),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}
