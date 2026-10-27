import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import Avatar from './Avatar.jsx'
import { Markdown } from '../lib/markdown.jsx'
import { coverImageStyle } from '../lib/backgrounds.js'
import { LABEL_COLORS, LABEL_COLOR_NAMES, PRIORITIES, PRIORITY_LABEL } from '../lib/constants.js'
import {
  dueStatus,
  dueStatusLabel,
  formatDateTime,
  formatDue,
  fromLocalInput,
  toLocalInput,
} from '../lib/dueDate.js'

export default function CardDetail({ cardId, board, currentUser, onClose, onBoardChange }) {
  const [card, setCard] = useState(null)
  const [error, setError] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descEditing, setDescEditing] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [descTab, setDescTab] = useState('write')
  const [panel, setPanel] = useState(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [editingComment, setEditingComment] = useState(null)
  const [commentEditDraft, setCommentEditDraft] = useState('')
  const [newChecklist, setNewChecklist] = useState('')
  const [itemDrafts, setItemDrafts] = useState({})
  const [busy, setBusy] = useState(false)
  const [coverUrl, setCoverUrl] = useState('')
  const [uploadingCover, setUploadingCover] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/cards/${cardId}`)
      setCard(data.card)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [cardId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Ejecuta una mutación que devuelve { card } y refresca el tablero. */
  async function run(action) {
    setBusy(true)
    try {
      const data = await action()
      if (data && data.card) setCard(data.card)
      onBoardChange?.()
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const patch = (payload) => run(() => api.patch(`/cards/${card?.id}`, payload))

  async function uploadCover(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) return
    setUploadingCover(true)
    try {
      const data = await api.upload(file)
      await patch({ coverImage: data.url, coverColor: null })
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingCover(false)
    }
  }

  if (!card) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(event) => event.stopPropagation()}>
          <p className="muted">{error || 'Cargando tarjeta…'}</p>
          <button className="btn ghost" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  const status = dueStatus(card.dueDate, card.dueComplete)
  const assigned = new Set(card.members.map((member) => member.id))
  const cardLabelIds = new Set(card.labels.map((label) => label.id))

  const coverStyle = coverImageStyle(card)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal card-modal${coverStyle || card.coverColor ? ' has-cover' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        {(coverStyle || card.coverColor) && (
          <div
            className={`card-modal-cover${coverStyle ? ' image' : ` bg-${card.coverColor}`}`}
            style={coverStyle || undefined}
          />
        )}
        <div className="modal-head">
          <span className="pill subtle">{card.listTitle || 'Lista'}</span>
          {card.archived && <span className="pill">Archivada</span>}
          <div className="modal-head-actions">
            <button className="btn ghost small" type="button" onClick={onClose} title="Cerrar (Esc)">
              ✕
            </button>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-body">
          <div className="card-modal-main">
            <div className="card-title-block">
              {editingTitle ? (
                <div className="stack">
                  <textarea
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <div className="row">
                    <button
                      className="btn primary small"
                      type="button"
                      disabled={busy || !titleDraft.trim()}
                      onClick={async () => {
                        await patch({ title: titleDraft.trim() })
                        setEditingTitle(false)
                      }}
                    >
                      Guardar
                    </button>
                    <button className="btn ghost small" type="button" onClick={() => setEditingTitle(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <h2
                  className="card-modal-title"
                  title="Clic para editar el título"
                  onClick={() => {
                    setTitleDraft(card.title)
                    setEditingTitle(true)
                  }}
                >
                  {card.title}
                </h2>
              )}
            </div>

            {card.labels.length > 0 && (
              <div className="label-chips big">
                {card.labels.map((label) => (
                  <span key={label.id} className={`label-chip bg-${label.color}`}>
                    {label.name || LABEL_COLOR_NAMES[label.color]}
                  </span>
                ))}
              </div>
            )}

            <div className="meta-grid">
              <div className="meta-col">
                <span className="meta-label">Fecha de vencimiento</span>
                <div className="row wrap">
                  {card.dueDate ? (
                    <span className={`pill due-${status}`}>{formatDue(card.dueDate)}</span>
                  ) : (
                    <span className="muted small">Sin fecha</span>
                  )}
                  <span className="muted small">{dueStatusLabel(card.dueDate, card.dueComplete)}</span>
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => setPanel(panel === 'due' ? null : 'due')}
                  >
                    Editar
                  </button>
                </div>
                {panel === 'due' && (
                  <div className="panel">
                    <label className="field">
                      <span>Fecha y hora</span>
                      <input
                        type="datetime-local"
                        defaultValue={toLocalInput(card.dueDate)}
                        onChange={(event) => patch({ dueDate: fromLocalInput(event.target.value) })}
                      />
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={card.dueComplete}
                        onChange={(event) => patch({ dueComplete: event.target.checked })}
                      />
                      Marcar como completada
                    </label>
                    {card.dueDate && (
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => patch({ dueDate: null, dueComplete: false })}
                      >
                        Quitar fecha
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="meta-col">
                <span className="meta-label">Prioridad</span>
                <select
                  value={card.priority}
                  onChange={(event) => patch({ priority: event.target.value })}
                  className={`priority-select priority-${card.priority}`}
                >
                  {PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABEL[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="meta-col">
                <span className="meta-label">Fondo de la tarjeta</span>
                <div className="swatches">
                  <button
                    type="button"
                    className={`swatch plain ${!card.coverColor && !card.coverImage ? 'selected' : ''}`}
                    title="Sin fondo"
                    onClick={() => patch({ coverColor: null, coverImage: null })}
                  />
                  {LABEL_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={LABEL_COLOR_NAMES[color]}
                      className={`swatch bg-${color} ${card.coverColor === color ? 'selected' : ''}`}
                      onClick={() => patch({ coverColor: color, coverImage: null })}
                    />
                  ))}
                  <button
                    type="button"
                    className={`swatch image-swatch${coverStyle ? ' selected' : ''}`}
                    title="Imagen de fondo"
                    onClick={() => setPanel(panel === 'cover' ? null : 'cover')}
                  >
                    🖼
                  </button>
                </div>
                {panel === 'cover' && (
                  <div className="panel">
                    <p className="muted small">
                      Sube una imagen o pega su URL para usarla como fondo de la tarjeta.
                    </p>
                    <div className="row wrap">
                      <label className={`btn small${uploadingCover ? ' disabled' : ''}`}>
                        {uploadingCover ? 'Subiendo…' : 'Subir imagen'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                          hidden
                          disabled={uploadingCover}
                          onChange={uploadCover}
                        />
                      </label>
                      {card.coverImage && (
                        <button
                          className="btn ghost small"
                          type="button"
                          onClick={() => patch({ coverImage: null })}
                        >
                          Quitar imagen
                        </button>
                      )}
                    </div>
                    <form
                      className="row"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        const url = coverUrl.trim()
                        if (!url) return
                        await patch({ coverImage: url, coverColor: null })
                        setCoverUrl('')
                      }}
                    >
                      <input
                        placeholder="https://ejemplo.com/portada.jpg"
                        value={coverUrl}
                        onChange={(event) => setCoverUrl(event.target.value)}
                      />
                      <button className="btn small" type="submit" disabled={!coverUrl.trim()}>
                        Usar URL
                      </button>
                    </form>
                  </div>
                )}
              </div>

              <div className="meta-col">
                <span className="meta-label">Etiquetas</span>
                <div className="row wrap">
                  {card.labels.map((label) => (
                    <span key={label.id} className={`label-chip bg-${label.color}`}>
                      {label.name || LABEL_COLOR_NAMES[label.color]}
                    </span>
                  ))}
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => setPanel(panel === 'labels' ? null : 'labels')}
                  >
                    + Añadir
                  </button>
                </div>
                {panel === 'labels' &&
                  (board.labels.length === 0 ? (
                    <p className="muted small">El tablero todavía no tiene etiquetas.</p>
                  ) : (
                    <div className="panel">
                      {board.labels.map((label) => (
                        <label key={label.id} className="check-row">
                          <input
                            type="checkbox"
                            checked={cardLabelIds.has(label.id)}
                            onChange={() =>
                              run(() =>
                                cardLabelIds.has(label.id)
                                  ? api.del(`/cards/${card.id}/labels/${label.id}`)
                                  : api.post(`/cards/${card.id}/labels`, { labelId: label.id })
                              )
                            }
                          />
                          <span className={`label-chip bg-${label.color}`}>
                            {label.name || LABEL_COLOR_NAMES[label.color]}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
              </div>
            </div>

            <section className="block">
              <div className="block-head">
                <h3>Descripción</h3>
                {!descEditing && (
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => {
                      setDescDraft(card.description || '')
                      setDescTab('write')
                      setDescEditing(true)
                    }}
                  >
                    Editar
                  </button>
                )}
              </div>

              {descEditing ? (
                <div className="desc-editor">
                  <div className="tabs">
                    <button
                      type="button"
                      className={descTab === 'write' ? 'tab active' : 'tab'}
                      onClick={() => setDescTab('write')}
                    >
                      Escribir
                    </button>
                    <button
                      type="button"
                      className={descTab === 'preview' ? 'tab active' : 'tab'}
                      onClick={() => setDescTab('preview')}
                    >
                      Vista previa
                    </button>
                  </div>
                  {descTab === 'write' ? (
                    <textarea
                      rows={8}
                      value={descDraft}
                      onChange={(event) => setDescDraft(event.target.value)}
                      placeholder={'# Objetivo\n\n- [ ] primer paso\n- [x] paso hecho\n\n**negrita**, *cursiva*, `código` y [enlaces](https://ejemplo.com)'}
                      autoFocus
                    />
                  ) : (
                    <div className="desc-preview">
                      <Markdown text={descDraft || '_Nada que previsualizar_' } />
                    </div>
                  )}
                  <div className="row">
                    <button
                      className="btn primary small"
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        await patch({ description: descDraft })
                        setDescEditing(false)
                      }}
                    >
                      Guardar
                    </button>
                    <button className="btn ghost small" type="button" onClick={() => setDescEditing(false)}>
                      Cancelar
                    </button>
                    <span className="muted small">Markdown enriquecido (GFM)</span>
                  </div>
                </div>
              ) : card.description ? (
                <Markdown text={card.description} />
              ) : (
                <p className="muted small">Sin descripción. Usa Markdown para dar formato.</p>
              )}
            </section>

            <section className="block">
              <div className="block-head">
                <h3>Checklists</h3>
              </div>

              {card.checklists.map((checklist) => {
                const done = checklist.items.filter((item) => item.done).length
                const percent = checklist.items.length ? Math.round((done / checklist.items.length) * 100) : 0
                return (
                  <div key={checklist.id} className="checklist">
                    <div className="checklist-head">
                      <input
                        className="inline-title"
                        defaultValue={checklist.title}
                        onBlur={(event) => {
                          const value = event.target.value.trim()
                          if (value && value !== checklist.title) {
                            run(() => api.patch(`/checklists/${checklist.id}`, { title: value }))
                          }
                        }}
                      />
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => run(() => api.del(`/checklists/${checklist.id}`))}
                      >
                        Eliminar
                      </button>
                    </div>

                    <div className="progress">
                      <span className="muted small">
                        {percent}% ({done}/{checklist.items.length})
                      </span>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${percent}%` }} />
                      </div>
                    </div>

                    <ul className="checklist-items">
                      {checklist.items.map((item) => (
                        <li key={item.id} className={item.done ? 'item done' : 'item'}>
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() =>
                              run(() => api.patch(`/checklist-items/${item.id}`, { done: !item.done }))
                            }
                          />
                          <input
                            className="inline-title"
                            defaultValue={item.text}
                            onBlur={(event) => {
                              const value = event.target.value.trim()
                              if (value && value !== item.text) {
                                run(() => api.patch(`/checklist-items/${item.id}`, { text: value }))
                              }
                            }}
                          />
                          <button
                            className="btn ghost small"
                            type="button"
                            title="Eliminar elemento"
                            onClick={() => run(() => api.del(`/checklist-items/${item.id}`))}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>

                    <form
                      className="row"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        const text = (itemDrafts[checklist.id] || '').trim()
                        if (!text) return
                        await run(() => api.post(`/checklists/${checklist.id}/items`, { text }))
                        setItemDrafts((prev) => ({ ...prev, [checklist.id]: '' }))
                      }}
                    >
                      <input
                        placeholder="Añadir elemento…"
                        value={itemDrafts[checklist.id] || ''}
                        onChange={(event) =>
                          setItemDrafts((prev) => ({ ...prev, [checklist.id]: event.target.value }))
                        }
                      />
                      <button className="btn small" type="submit">
                        Añadir
                      </button>
                    </form>
                  </div>
                )
              })}

              <form
                className="row"
                onSubmit={async (event) => {
                  event.preventDefault()
                  const title = newChecklist.trim()
                  if (!title) return
                  await run(() => api.post(`/cards/${card.id}/checklists`, { title }))
                  setNewChecklist('')
                }}
              >
                <input
                  placeholder="Nuevo checklist (p. ej. «Criterios de aceptación»)"
                  value={newChecklist}
                  onChange={(event) => setNewChecklist(event.target.value)}
                />
                <button className="btn small" type="submit">
                  Añadir checklist
                </button>
              </form>
            </section>

            <section className="block">
              <div className="block-head">
                <h3>Comentarios ({card.comments.length})</h3>
              </div>

              <div className="comment-composer">
                <Avatar user={currentUser} size={30} />
                <form
                  className="stack grow"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    const body = commentDraft.trim()
                    if (!body) return
                    await run(() => api.post(`/cards/${card.id}/comments`, { body }))
                    setCommentDraft('')
                  }}
                >
                  <textarea
                    rows={3}
                    placeholder="Escribe un comentario (admite Markdown)…"
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                  />
                  <div className="row">
                    <button className="btn primary small" type="submit" disabled={busy || !commentDraft.trim()}>
                      Comentar
                    </button>
                    {commentDraft && (
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => setCommentDraft('')}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <ul className="comment-list">
                {card.comments.map((comment) => {
                  const canModify =
                    comment.user.id === currentUser.id ||
                    board.members.some(
                      (member) => member.id === currentUser.id && member.role === 'owner'
                    )
                  return (
                    <li key={comment.id} className="comment">
                      <Avatar user={comment.user} size={30} />
                      <div className="comment-body">
                        <div className="comment-head">
                          <strong>{comment.user.name || comment.user.username}</strong>
                          <span className="muted small">@{comment.user.username}</span>
                          <span className="muted small">{formatDateTime(comment.createdAt)}</span>
                          {comment.updatedAt !== comment.createdAt && (
                            <span className="muted small">(editado)</span>
                          )}
                        </div>

                        {editingComment === comment.id ? (
                          <div className="stack">
                            <textarea
                              rows={3}
                              value={commentEditDraft}
                              onChange={(event) => setCommentEditDraft(event.target.value)}
                            />
                            <div className="row">
                              <button
                                className="btn primary small"
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  await run(() =>
                                    api.patch(`/comments/${comment.id}`, { body: commentEditDraft.trim() })
                                  )
                                  setEditingComment(null)
                                }}
                              >
                                Guardar
                              </button>
                              <button
                                className="btn ghost small"
                                type="button"
                                onClick={() => setEditingComment(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <Markdown text={comment.body} />
                        )}

                        {canModify && editingComment !== comment.id && (
                          <div className="row">
                            <button
                              className="btn ghost small"
                              type="button"
                              onClick={() => {
                                setEditingComment(comment.id)
                                setCommentEditDraft(comment.body)
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className="btn ghost small"
                              type="button"
                              onClick={() => run(() => api.del(`/comments/${comment.id}`))}
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
                {card.comments.length === 0 && <li className="muted small">Todavía no hay comentarios.</li>}
              </ul>
            </section>
          </div>

          <aside className="card-modal-side">
            <div className="side-block">
              <span className="meta-label">Miembros</span>
              <div className="stack">
                {board.members.map((member) => (
                  <label key={member.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={assigned.has(member.id)}
                      onChange={() =>
                        run(() =>
                          assigned.has(member.id)
                            ? api.del(`/cards/${card.id}/members/${member.id}`)
                            : api.post(`/cards/${card.id}/members`, { userId: member.id })
                        )
                      }
                    />
                    <Avatar user={member} size={24} />
                    <span className="small">{member.name || member.username}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="side-block">
              <span className="meta-label">Mover a lista</span>
              <select
                value={card.listId}
                onChange={(event) =>
                  patch({ listId: event.target.value, targetIndex: 0 })
                }
              >
                {board.lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="side-block">
              <span className="meta-label">Acciones</span>
              <div className="stack">
                <button
                  className="btn small"
                  type="button"
                  onClick={() => patch({ archived: !card.archived })}
                >
                  {card.archived ? 'Restaurar tarjeta' : 'Archivar tarjeta'}
                </button>
                <button
                  className="btn small danger"
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('¿Eliminar esta tarjeta definitivamente?')) return
                    await run(() => api.del(`/cards/${card.id}`))
                    onClose()
                  }}
                >
                  Eliminar tarjeta
                </button>
              </div>
            </div>

            <div className="side-block">
              <span className="meta-label">Actividad</span>
              <p className="muted small">Creada el {formatDateTime(card.createdAt)}</p>
              <p className="muted small">Actualizada el {formatDateTime(card.updatedAt)}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
