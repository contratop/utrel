import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import Icon from '../components/Icon.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ContextMenu from '../components/ContextMenu.jsx'
import ProfileDialog from '../components/ProfileDialog.jsx'
import { boardTileArtwork } from '../lib/backgrounds.js'
import { newLaneId, reconcileLanes } from '../lib/lanes.js'
import { BOARD_BACKGROUNDS } from '../lib/constants.js'

/** Tarjeta de tablero compartida por la cuadrícula y las columnas Kanban. */
function BoardTile({ board, onMenu, dragging, onDragStart, onDragEnd, onClickCapture }) {
  const artwork = boardTileArtwork(board)
  return (
    <Link
      to={`/b/${board.id}`}
      className={`board-tile ${artwork.className}${dragging ? ' dragging' : ''}`}
      style={artwork.style}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClickCapture={onClickCapture}
      onContextMenu={(event) => onMenu(event, board)}
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
        <span className="pill subtle">
          {board.role === 'owner' ? 'Propietario' : 'Miembro'}
        </span>
      </div>
    </Link>
  )
}

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
  const [confirmState, setConfirmState] = useState(null)
  const [lanes, setLanes] = useState([])
  const [addingLane, setAddingLane] = useState(false)
  const [newLaneTitle, setNewLaneTitle] = useState('')
  const [renamingLane, setRenamingLane] = useState(null)
  const [laneDraft, setLaneDraft] = useState('')
  const [draggingBoardId, setDraggingBoardId] = useState(null)
  const [dragOverLaneId, setDragOverLaneId] = useState(null)
  const dragEndedAtRef = useRef(0)
  const [view, setView] = useState(() => {
    try {
      return window.localStorage.getItem('utrel:boards-view') === 'kanban' ? 'kanban' : 'grid'
    } catch {
      return 'grid'
    }
  })

  async function load() {
    try {
      const data = await api.get('/boards')
      setBoards(data.boards)
      setLanes(reconcileLanes(data.lanes, data.boards))
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

  // La vista elegida (normal o Kanban) es una preferencia de este dispositivo.
  useEffect(() => {
    try {
      window.localStorage.setItem('utrel:boards-view', view)
    } catch {
      /* almacenamiento no disponible (modo privado) */
    }
  }, [view])

  const boardsById = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards])
  const boardsOfLane = (lane) =>
    lane.boardIds.map((id) => boardsById.get(id)).filter(Boolean)

  /** Guarda las columnas del Kanban en el servidor (por usuario). */
  async function persistLanes(next) {
    setLanes(next)
    try {
      const data = await api.put('/boards/lanes', { lanes: next })
      if (data && Array.isArray(data.lanes)) setLanes(data.lanes)
      setError('')
    } catch (err) {
      setError(err.message)
      load()
    }
  }

  function createLane(event) {
    event.preventDefault()
    const title = newLaneTitle.trim()
    if (!title) return
    setNewLaneTitle('')
    setAddingLane(false)
    persistLanes([...lanes, { id: newLaneId(), title: title.slice(0, 40), boardIds: [] }])
  }

  function startRenameLane(lane) {
    setRenamingLane(lane.id)
    setLaneDraft(lane.title)
  }

  function saveLaneTitle(event) {
    event.preventDefault()
    const title = laneDraft.trim()
    if (!title || renamingLane === null) {
      setRenamingLane(null)
      return
    }
    const next = lanes.map((lane) =>
      lane.id === renamingLane ? { ...lane, title: title.slice(0, 40) } : lane
    )
    setRenamingLane(null)
    persistLanes(next)
  }

  function moveLane(laneId, delta) {
    const index = lanes.findIndex((lane) => lane.id === laneId)
    const target = index + delta
    if (index < 0 || target < 0 || target >= lanes.length) return
    const next = [...lanes]
    ;[next[index], next[target]] = [next[target], next[index]]
    persistLanes(next)
  }

  function moveBoardToLane(boardId, laneId) {
    const next = lanes.map((lane) => ({
      ...lane,
      boardIds:
        lane.id === laneId
          ? [...lane.boardIds.filter((id) => id !== boardId), boardId]
          : lane.boardIds.filter((id) => id !== boardId),
    }))
    persistLanes(next)
  }

  /** Arrastre de tableros entre columnas del tablero maestro. */
  function startBoardDrag(event, board) {
    dragEndedAtRef.current = 0
    setDraggingBoardId(board.id)
    setDragOverLaneId(null)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', board.id)
    }
  }

  function endBoardDrag() {
    setDraggingBoardId(null)
    setDragOverLaneId(null)
    // Un arrastre puede terminar con un clic sobre el enlace: evita abrir el tablero.
    dragEndedAtRef.current = Date.now()
  }

  function guardTileClick(event) {
    if (Date.now() - dragEndedAtRef.current < 300) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function handleLaneDragOver(event, laneId) {
    if (!draggingBoardId) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (dragOverLaneId !== laneId) setDragOverLaneId(laneId)
  }

  function handleLaneDragLeave(event, laneId) {
    if (dragOverLaneId !== laneId) return
    const next = event.relatedTarget
    if (next && event.currentTarget.contains(next)) return
    setDragOverLaneId(null)
  }

  function handleLaneDrop(event, laneId) {
    event.preventDefault()
    const lane = lanes.find((item) => item.id === laneId)
    const boardId = event.dataTransfer?.getData('text/plain') || draggingBoardId
    // Al moverse de columna la tarjeta se vuelve a montar y el `dragend` del
    // nodo original ya no se dispara: limpia el estado aquí.
    setDraggingBoardId(null)
    setDragOverLaneId(null)
    dragEndedAtRef.current = Date.now()
    if (!lane || !boardId || !boardsById.has(boardId)) return
    // Soltar al final de la misma columna no cambia nada: evita una petición vacía.
    if (lane.boardIds[lane.boardIds.length - 1] === boardId) return
    moveBoardToLane(boardId, laneId)
  }

  function askDeleteLane(lane) {
    const remaining = lanes.filter((item) => item.id !== lane.id)
    const fallback = remaining[0]
    if (!fallback) return
    setConfirmState({
      title: 'Eliminar columna',
      message:
        lane.boardIds.length > 0
          ? `¿Eliminar la columna «${lane.title}»? Sus tableros pasarán a «${fallback.title}».`
          : `¿Eliminar la columna «${lane.title}»?`,
      confirmLabel: 'Eliminar columna',
      onConfirm: () =>
        persistLanes(
          remaining.map((item) =>
            item.id === fallback.id
              ? { ...item, boardIds: [...item.boardIds, ...lane.boardIds] }
              : item
          )
        ),
    })
  }

  /** Menú propio de la tarjeta de tablero (clic derecho). */
  function openTileMenu(event, board) {
    event.preventDefault()
    event.stopPropagation()
    const currentLane =
      view === 'kanban' ? lanes.find((lane) => lane.boardIds.includes(board.id)) : null
    const moveTargets = currentLane
      ? lanes.filter((lane) => lane.id !== currentLane.id)
      : []
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: 'Abrir tablero',
          icon: <Icon name="arrow-up-right" />,
          onSelect: () => navigate(`/b/${board.id}`),
        },
        ...(moveTargets.length > 0
          ? [
              { separator: true },
              ...moveTargets.map((lane) => ({
                label: `Mover a «${lane.title}»`,
                icon: <Icon name="arrow-right" />,
                onSelect: () => moveBoardToLane(board.id, lane.id),
              })),
            ]
          : []),
        { separator: true },
        {
          label: 'Eliminar tablero',
          icon: <Icon name="trash" />,
          danger: true,
          disabled: board.role !== 'owner',
          onSelect: () =>
            setConfirmState({
              title: 'Eliminar tablero',
              message: `¿Eliminar el tablero «${board.title}» y todas sus tarjetas?`,
              confirmLabel: 'Eliminar tablero',
              onConfirm: () => run(() => api.del(`/boards/${board.id}`)),
            }),
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

      <main className={`boards-main${view === 'kanban' ? ' boards-main-wide' : ''}`}>
        <div className="section-head">
          <div>
            <h2>Mis tableros</h2>
            <p className="muted small section-subtitle">
              {boards.length === 0
                ? 'Organiza tus proyectos y tareas en un solo lugar.'
                : `${boards.length} tablero${boards.length === 1 ? '' : 's'} a tu nombre`}
            </p>
          </div>
          <div className="section-head-actions">
            <div className="segmented" role="group" aria-label="Vista de tableros">
              <button
                type="button"
                className={view === 'grid' ? 'segment active' : 'segment'}
                onClick={() => setView('grid')}
                title="Vista normal: tableros en cuadrícula"
              >
                <Icon name="layout-grid" size={14} />
                Normal
              </button>
              <button
                type="button"
                className={view === 'kanban' ? 'segment active' : 'segment'}
                onClick={() => setView('kanban')}
                title="Vista Kanban: cada tarjeta es un tablero"
              >
                <Icon name="folder-kanban" size={14} />
                Kanban
              </button>
            </div>
            <button className="btn primary" type="button" onClick={() => setCreating((v) => !v)}>
              {creating ? 'Cancelar' : 'Nuevo tablero'}
            </button>
          </div>
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
            <span className="empty-state-icon">
              <Icon name="folder-kanban" size={30} />
            </span>
            <h3>Aún no hay tableros</h3>
            <p className="muted small">
              Crea tu primer tablero y organiza proyectos con listas, tarjetas y fechas de vencimiento.
            </p>
            <button className="btn primary" type="button" onClick={() => setCreating(true)}>
              Crear mi primer tablero
            </button>
          </div>
        )}

        {view === 'grid' ? (
          <div className="board-grid">
            {boards.map((board) => (
              <BoardTile key={board.id} board={board} onMenu={openTileMenu} />
            ))}
          </div>
        ) : (
          <div className="boards-kanban">
            {lanes.map((lane, laneIndex) => {
              const laneBoards = boardsOfLane(lane)
              return (
                <section
                  className={`boards-kanban-column${
                    draggingBoardId && dragOverLaneId === lane.id ? ' drop-target' : ''
                  }`}
                  key={lane.id}
                  onDragOver={(event) => handleLaneDragOver(event, lane.id)}
                  onDragLeave={(event) => handleLaneDragLeave(event, lane.id)}
                  onDrop={(event) => handleLaneDrop(event, lane.id)}
                >
                  <header className="boards-kanban-head">
                    {renamingLane === lane.id ? (
                      <form className="lane-rename" onSubmit={saveLaneTitle}>
                        <input
                          value={laneDraft}
                          onChange={(event) => setLaneDraft(event.target.value)}
                          maxLength={40}
                          autoFocus
                          aria-label="Título de la columna"
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.stopPropagation()
                              setRenamingLane(null)
                            }
                          }}
                        />
                        <button className="btn primary small" type="submit" title="Guardar">
                          <Icon name="save" size={13} />
                        </button>
                        <button
                          className="btn ghost small"
                          type="button"
                          title="Cancelar"
                          onClick={() => setRenamingLane(null)}
                        >
                          <Icon name="x" size={13} />
                        </button>
                      </form>
                    ) : (
                      <h3
                        title="Clic para renombrar la columna"
                        onClick={() => startRenameLane(lane)}
                      >
                        {lane.title}
                      </h3>
                    )}
                    <span className="pill subtle">{laneBoards.length}</span>
                    {renamingLane !== lane.id && (
                      <div className="lane-actions">
                        <button
                          type="button"
                          title="Renombrar columna"
                          aria-label={`Renombrar «${lane.title}»`}
                          onClick={() => startRenameLane(lane)}
                        >
                          <Icon name="pencil" size={13} />
                        </button>
                        <button
                          type="button"
                          title="Mover columna a la izquierda"
                          aria-label={`Mover «${lane.title}» a la izquierda`}
                          disabled={laneIndex === 0}
                          onClick={() => moveLane(lane.id, -1)}
                        >
                          <Icon name="chevron-left" size={13} />
                        </button>
                        <button
                          type="button"
                          title="Mover columna a la derecha"
                          aria-label={`Mover «${lane.title}» a la derecha`}
                          disabled={laneIndex === lanes.length - 1}
                          onClick={() => moveLane(lane.id, 1)}
                        >
                          <Icon name="chevron-right" size={13} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar columna"
                          aria-label={`Eliminar «${lane.title}»`}
                          disabled={lanes.length === 1}
                          onClick={() => askDeleteLane(lane)}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    )}
                  </header>

                  <div className="boards-kanban-cards">
                    {laneBoards.map((board) => (
                      <BoardTile
                        key={board.id}
                        board={board}
                        onMenu={openTileMenu}
                        dragging={draggingBoardId === board.id}
                        onDragStart={(event) => startBoardDrag(event, board)}
                        onDragEnd={endBoardDrag}
                        onClickCapture={guardTileClick}
                      />
                    ))}
                    {laneBoards.length === 0 && (
                      <p className="muted small boards-kanban-empty">Sin tableros.</p>
                    )}
                  </div>
                </section>
              )
            })}

            <div className="boards-kanban-add">
              {addingLane ? (
                <form className="lane-rename" onSubmit={createLane}>
                  <input
                    value={newLaneTitle}
                    onChange={(event) => setNewLaneTitle(event.target.value)}
                    placeholder="Nombre de la columna"
                    maxLength={40}
                    autoFocus
                    aria-label="Nombre de la nueva columna"
                  />
                  <button className="btn primary small" type="submit" disabled={!newLaneTitle.trim()}>
                    Añadir
                  </button>
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => {
                      setAddingLane(false)
                      setNewLaneTitle('')
                    }}
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <button
                  className="btn ghost wide boards-kanban-add-button"
                  type="button"
                  onClick={() => setAddingLane(true)}
                  disabled={lanes.length >= 8}
                  title={lanes.length >= 8 ? 'Máximo 8 columnas' : 'Añadir una columna'}
                >
                  <Icon name="plus" size={14} />
                  Añadir columna
                </button>
              )}
            </div>
          </div>
        )}
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

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            const action = confirmState.onConfirm
            setConfirmState(null)
            action()
          }}
        />
      )}
    </div>
  )
}
