import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const formatStamp = (value) =>
  value
    ? new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''

export default function ProfileDialog({ onClose, onUpdated }) {
  const { user, setUser } = useAuth()
  const [urlDraft, setUrlDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tokens, setTokens] = useState([])
  const [tokensError, setTokensError] = useState('')
  const [tokenName, setTokenName] = useState('')
  const [newToken, setNewToken] = useState('')
  const [creatingToken, setCreatingToken] = useState(false)
  const [copied, setCopied] = useState(false)
  const tokenInputRef = useRef(null)

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const apiUrl = `${origin}/api`
  const mcpUrl = `${origin}/api/mcp`

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    api
      .get('/auth/tokens')
      .then((data) => {
        if (alive) setTokens(data.tokens || [])
      })
      .catch((err) => {
        if (alive) setTokensError(err.message)
      })
    return () => {
      alive = false
    }
  }, [])

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

  async function generateToken(event) {
    event.preventDefault()
    setCreatingToken(true)
    try {
      const data = await api.post('/auth/tokens', {
        name: tokenName.trim() || 'Token de API',
      })
      setNewToken(data.token)
      setTokens(data.tokens || [])
      setTokenName('')
      setTokensError('')
    } catch (err) {
      setTokensError(err.message)
    } finally {
      setCreatingToken(false)
    }
  }

  async function revokeToken(id) {
    try {
      const data = await api.del(`/auth/tokens/${id}`)
      setTokens(data.tokens || [])
      setTokensError('')
    } catch (err) {
      setTokensError(err.message)
    }
  }

  async function copyToken() {
    if (!newToken) return
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('sin portapapeles')
      await navigator.clipboard.writeText(newToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso de portapapeles, al menos deja el token seleccionado.
      tokenInputRef.current?.select()
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

        <section className="block token-section">
          <div className="block-head">
            <h3>Acceso API y MCP</h3>
            <span className="pill subtle">
              <Icon name="key" size={12} />
              Tokens
            </span>
          </div>
          <p className="muted small">
            Genera un token para que n8n, Zapier, un script o un modelo de IA creen, editen y borren
            tarjetas con la API REST y el servidor MCP. Se muestra una sola vez.
          </p>
          <code className="api-endpoint">{apiUrl}</code>
          <code className="api-endpoint">{mcpUrl}</code>

          <form className="row" onSubmit={generateToken}>
            <input
              placeholder="Nombre del token (n8n, Claude…)"
              value={tokenName}
              maxLength={60}
              onChange={(event) => setTokenName(event.target.value)}
            />
            <button className="btn primary small" type="submit" disabled={creatingToken}>
              <Icon
                name={creatingToken ? 'loader' : 'key'}
                size={14}
                className={creatingToken ? 'spin' : ''}
              />
              {creatingToken ? 'Generando…' : 'Generar token'}
            </button>
          </form>

          {newToken && (
            <div className="token-reveal">
              <p className="small">
                <strong>Cópialo ahora:</strong> no se volverá a mostrar.
              </p>
              <div className="row">
                <input
                  ref={tokenInputRef}
                  readOnly
                  value={newToken}
                  aria-label="Token generado"
                  onFocus={(event) => event.target.select()}
                />
                <button className="btn small" type="button" onClick={copyToken}>
                  <Icon name={copied ? 'check' : 'copy'} size={14} />
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="muted small">
                Envíalo como <code>Authorization: Bearer &lt;token&gt;</code> a la API, o configura
                ese mismo encabezado en el cliente MCP apuntando a <code>{mcpUrl}</code>.
              </p>
            </div>
          )}

          {tokensError && <p className="form-error">{tokensError}</p>}

          {tokens.length > 0 ? (
            <ul className="token-list">
              {tokens.map((token) => (
                <li key={token.id}>
                  <div>
                    <strong className="small">{token.name}</strong>
                    <p className="muted small">
                      <code>{token.prefix}…</code> · creado el {formatStamp(token.createdAt)}
                      {token.lastUsedAt
                        ? ` · último uso ${formatStamp(token.lastUsedAt)}`
                        : ' · sin usar'}
                    </p>
                  </div>
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => revokeToken(token.id)}
                    title={`Revocar ${token.name}`}
                  >
                    <Icon name="trash" size={14} />
                    Revocar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Todavía no tienes tokens.</p>
          )}
        </section>

        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  )
}
