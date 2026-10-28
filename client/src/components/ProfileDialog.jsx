import { useEffect, useState } from 'react'
import { api } from '../api.js'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProfileDialog({ onClose, onUpdated }) {
  const { user, setUser } = useAuth()
  const [urlDraft, setUrlDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(payload) {
    setBusy(true)
    try {
      const data = await api.patch('/auth/me', payload)
      setUser(data.user)
      onUpdated?.(data.user)
      setError('')
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function upload(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const data = await api.upload(file)
      await save({ avatar: data.url })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow profile-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Mi perfil</h2>
          <div className="modal-head-actions">
            <button className="btn ghost small" type="button" onClick={onClose} title="Cerrar (Esc)">
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>

        <div className="profile-preview">
          <Avatar user={user} size={96} />
          <div>
            <strong>{user.name || user.username}</strong>
            <p className="muted small">@{user.username}</p>
            <p className="muted small">{user.email}</p>
          </div>
        </div>

        <section className="block">
          <div className="block-head">
            <h3>Foto de perfil</h3>
            {user.avatar && (
              <button
                className="btn ghost small"
                type="button"
                disabled={busy}
                onClick={() => save({ avatar: null })}
              >
                Quitar foto
              </button>
            )}
          </div>
          <p className="muted small">
            Se verá en tus tableros, en las tarjetas asignadas y en tus comentarios. PNG, JPEG, WebP,
            GIF o AVIF hasta 8 MB.
          </p>
          <div className="row wrap">
            <label className={`btn small${busy ? ' disabled' : ''}`}>
              <Icon name={busy ? 'loader' : 'upload'} size={14} className={busy ? 'spin' : ''} />
              {busy ? 'Guardando…' : 'Subir foto'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                hidden
                disabled={busy}
                onChange={upload}
              />
            </label>
          </div>
          <form
            className="row"
            onSubmit={async (event) => {
              event.preventDefault()
              const value = urlDraft.trim()
              if (!value) return
              if (await save({ avatar: value })) setUrlDraft('')
            }}
          >
            <input
              placeholder="https://ejemplo.com/foto.jpg"
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
            />
            <button className="btn small" type="submit" disabled={busy || !urlDraft.trim()}>
              Usar URL
            </button>
          </form>
        </section>

        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  )
}
