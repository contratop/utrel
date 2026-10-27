import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { boardArtwork } from '../lib/backgrounds.js'
import { BOARD_BACKGROUNDS, BOARD_BACKGROUND_NAMES } from '../lib/constants.js'

export default function BoardBackgroundDialog({ board, onApply, onClose }) {
  const [urlDraft, setUrlDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const artwork = boardArtwork(board)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function apply(payload) {
    try {
      await onApply(payload)
      setError('')
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  async function upload(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const data = await api.upload(file)
      await onApply({ backgroundImage: data.url })
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow background-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Fondo del tablero</h2>
          <div className="modal-head-actions">
            <button className="btn ghost small" type="button" onClick={onClose} title="Cerrar (Esc)">
              ✕
            </button>
          </div>
        </div>

        <div className={`bg-preview ${artwork.className}`} style={artwork.style}>
          <span className="bg-preview-title">{board.title}</span>
        </div>

        <section className="block">
          <h3>Degradados</h3>
          <div className="background-grid">
            {BOARD_BACKGROUNDS.map((key) => (
              <button
                key={key}
                type="button"
                className={`background-option bg-${key}${
                  !board.backgroundImage && board.background === key ? ' selected' : ''
                }`}
                onClick={() => apply({ background: key, backgroundImage: null })}
              >
                <span>{BOARD_BACKGROUND_NAMES[key]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-head">
            <h3>Imagen propia</h3>
            {board.backgroundImage && (
              <button
                className="btn ghost small"
                type="button"
                onClick={() => apply({ backgroundImage: null })}
              >
                Quitar imagen
              </button>
            )}
          </div>
          <p className="muted small">
            Sube una foto (PNG, JPEG, WebP, GIF o AVIF, hasta 8 MB) o pega la URL de una imagen.
          </p>
          <div className="row wrap">
            <label className={`btn small${uploading ? ' disabled' : ''}`}>
              {uploading ? 'Subiendo…' : 'Subir imagen'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                hidden
                disabled={uploading}
                onChange={upload}
              />
            </label>
            {board.backgroundImage && (
              <span className="muted small ellipsis" title={board.backgroundImage}>
                {board.backgroundImage}
              </span>
            )}
          </div>
          <form
            className="row"
            onSubmit={async (event) => {
              event.preventDefault()
              const value = urlDraft.trim()
              if (!value) return
              if (await apply({ backgroundImage: value })) setUrlDraft('')
            }}
          >
            <input
              placeholder="https://ejemplo.com/fondo.jpg"
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
            />
            <button className="btn small" type="submit" disabled={!urlDraft.trim()}>
              Usar URL
            </button>
          </form>
        </section>

        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  )
}
