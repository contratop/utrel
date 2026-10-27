import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import ContextMenu from '../components/ContextMenu.jsx'
import ProfileDialog from '../components/ProfileDialog.jsx'
import { boardTileArtwork } from '../lib/backgrounds.js'
import { BOARD_BACKGROUNDS } from '../lib/constants.js'

export default function Boards() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [background, setBackground] = useState(BOARD_BACKGROUNDS[0])
  const [profileOpen, setProfileOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)

  async function load() {
    try {
      const data = await api.get('/boards')
      setBoards(data.boards)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  /** Menú propio de la tarjeta de tablero (clic derecho). */
  function openTileMenu(event, board) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: 'Abrir tablero', icon: '↗', onSelect: () => navigate(`/b/${board.id}`) },
        { separator: true },
        {
          label: 'Archivar tablero',
          icon: '📦',
          onSelect: () => run(() => api.patch(`/boards/${board.id}`, { archived: true })),
        },
        {
          label: 'Eliminar tablero',
          icon: '🗑️',
          danger: true,
          disabled: board.role !== 'owner',
          onSelect: () => {
            if (!window.confirm(`¿Eliminar el tablero «${board.title}» y todas sus tarjetas?`)) return
            run(() => api.del(`/boards/${board.id}`))
          },
        },
      ],
    })
  }

  /** Ejecuta una acción del menú y recarga la lista de tableros. */
  async function run(action) {
    try {
      await action()
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      await load()
    }
  }

  async function create(event) {
    event.preventDefault()
    if (!title.trim()) return
    try {
      const data = await api.post('/boards', { title: title.trim(), background })
      navigate(`/b/${data.board.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="boards-page">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/brand/utrel-mark.svg" alt="" width="30" height="30" />
          <strong>Utrel</strong>
        </div>
        <div className="topbar-right">
          {user.isAdmin && (
            <Link className="btn ghost small" to="/admin">
              Panel de administración
            </Link>
          )}
          <button
            className="profile-trigger"
            type="button"
            onClick={() => setProfileOpen(true)}
            title="Mi perfil"
          >
            <Avatar user={user} size={28} />
            <span className="muted small">@{user.username}</span>
          </button>
          <button className="btn ghost" type="button" onClick={() => logout()}>
            Salir
          </button>
        </div>
      </header>

      <main className="boards-main">
        <div className="section-head">
          <div>
            <h2>Mis tableros</h2>
            <p className="muted small section-subtitle">
              {boards.length === 0
                ? 'Organiza tus proyectos y tareas en un solo lugar.'
                : `${boards.length} tablero${boards.length === 1 ? '' : 's'} a tu nombre`}
            </p>
          </div>
          <button className="btn primary" type="button" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancelar' : 'Nuevo tablero'}
          </button>
        </div>

        {creating && (
          <form className="card-form" onSubmit={create}>
            <label className="field">
              <span>Título del tablero</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Proyecto web"
                autoFocus
                required
              />
            </label>
            <div className="field">
              <span>Fondo</span>
              <div className="swatches">
                {BOARD_BACKGROUNDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    title={value}
                    className={`swatch bg-${value} ${background === value ? 'selected' : ''}`}
                    onClick={() => setBackground(value)}
                  />
                ))}
              </div>
            </div>
            <button className="btn primary" type="submit">
              Crear tablero
            </button>
          </form>
        )}

        {error && <p className="form-error">{error}</p>}
        {loading && <p className="muted">Cargando tableros…</p>}

        {!loading && boards.length === 0 && !creating && (
          <div className="empty-state">
            <span className="empty-state-icon">🗂️</span>
            <h3>Aún no hay tableros</h3>
            <p className="muted small">
              Crea tu primer tablero y organiza proyectos con listas, tarjetas y fechas de vencimiento.
            </p>
            <button className="btn primary" type="button" onClick={() => setCreating(true)}>
              Crear mi primer tablero
            </button>
          </div>
        )}

        <div className="board-grid">
          {boards.map((board) => {
            const artwork = boardTileArtwork(board)
            return (
              <Link
                key={board.id}
                to={`/b/${board.id}`}
                className={`board-tile ${artwork.className}`}
                style={artwork.style}
                onContextMenu={(event) => openTileMenu(event, board)}
              >
                <div className="board-tile-body">
                  <h3>{board.title}</h3>
                  <p className="board-tile-meta">
                    {board.listCount} listas · {board.cardCount} tarjetas
                    {board.overdueCount > 0 && (
                      <span className="badge overdue-inline"> · {board.overdueCount} vencidas</span>
                    )}
                  </p>
                </div>
                <div className="board-tile-foot">
                  <div className="avatar-row">
                    {board.members.slice(0, 4).map((member) => (
                      <Avatar key={member.id} user={member} size={24} />
                    ))}
                    {board.members.length > 4 && (
                      <span className="muted small tile-extra">+{board.members.length - 4}</span>
                    )}
                  </div>
                  <span className="pill subtle">{board.role === 'owner' ? 'Propietario' : 'Miembro'}</span>
                </div>
              </Link>
            )
          })}
        </div>
      </main>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {profileOpen && (
        <ProfileDialog onClose={() => setProfileOpen(false)} onUpdated={() => load()} />
      )}
    </div>
  )
}
