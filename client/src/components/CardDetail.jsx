import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import Avatar from './Avatar.jsx'
import ActivityFeed from './ActivityFeed.jsx'
import Icon from './Icon.jsx'
import ColorSelect from './ColorSelect.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { Markdown } from '../lib/markdown.jsx'
import { dropIndexFromRects, serverIndexFor } from '../lib/dnd.js'
import { COVER_POSITION_OPTIONS, coverImageStyle } from '../lib/backgrounds.js'
import { LABEL_COLOR_NAMES, PRIORITIES, PRIORITY_LABEL } from '../lib/constants.js'
import { useBackdropPress, useDismissOnOutside } from '../lib/editing.js'
import {
  dueStatus,
  dueStatusLabel,
  formatDateTime,
  formatDue,
  fromLocalInput,
  toLocalInput,
} from '../lib/dueDate.js'

/** El título del detalle es de una sola línea y como mucho 100 caracteres. */
const cleanTitle = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100)

/**
 * Textarea que crece con su contenido: el texto de un elemento de checklist se
 * ve entero de un vistazo, sin quedar recortado en una línea.
 */
function growTextarea(node) {
  if (!node) return
  node.style.height = 'auto'
  node.style.height = `${node.scrollHeight}px`
}

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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragGhost, setDragGhost] = useState(null)
  const [checklistHint, setChecklistHint] = useState(null)
  const [itemHint, setItemHint] = useState(null)

  const dragStateRef = useRef(null)
  const checklistHintRef = useRef(null)
  const itemHintRef = useRef(null)

  const titleRef = useRef(null)
  const descRef = useRef(null)
  const descTextareaRef = useRef(null)
  const descSelectionRef = useRef(null)

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

  // La cinta de formato cambia el texto y recoloca la selección después del
  // repintado de React, para poder seguir escribiendo donde estabas.
  useEffect(() => {
    const selection = descSelectionRef.current
    if (!selection) return
    const node = descTextareaRef.current
    if (!node) return
    descSelectionRef.current = null
    node.focus()
    node.setSelectionRange(selection[0], selection[1])
  }, [descDraft, descEditing])

  function updateDescription(next, selection) {
    descSelectionRef.current = selection
    setDescDraft(next)
  }

  /** Envuelve el texto seleccionado (o un texto de ejemplo) entre dos marcas. */
  function applyInlineFormat(before, after = before, placeholder = 'texto') {
    const node = descTextareaRef.current
    if (!node) return
    const start = node.selectionStart
    const end = node.selectionEnd
    const selected = descDraft.slice(start, end) || placeholder
    const next = `${descDraft.slice(0, start)}${before}${selected}${after}${descDraft.slice(end)}`
    updateDescription(next, [start + before.length, start + before.length + selected.length])
  }

  /** Aplica (o quita) un prefijo de bloque a cada línea seleccionada. */
  function applyLineFormat(prefix) {
    const node = descTextareaRef.current
    if (!node) return
    const start = node.selectionStart
    const end = node.selectionEnd
    const lineStart = start === 0 ? 0 : descDraft.lastIndexOf('\n', start - 1) + 1
    const nextBreak = descDraft.indexOf('\n', end)
    const sliceEnd = nextBreak === -1 ? descDraft.length : nextBreak
    const lines = descDraft.slice(lineStart, sliceEnd).split('\n')
    const remove = lines.every((line) => !line.trim() || line.startsWith(prefix))
    const updated = lines
      .map((line) => {
        if (!line.trim()) return line
        return remove ? line.slice(prefix.length) : prefix + line
      })
      .join('\n')
    updateDescription(descDraft.slice(0, lineStart) + updated + descDraft.slice(sliceEnd), [
      lineStart,
      lineStart + updated.length,
    ])
  }

  function applyLinkFormat() {
    const node = descTextareaRef.current
    if (!node) return
    const start = node.selectionStart
    const end = node.selectionEnd
    const selected = descDraft.slice(start, end) || 'texto'
    const url = 'https://ejemplo.com'
    const next = `${descDraft.slice(0, start)}[${selected}](${url})${descDraft.slice(end)}`
    updateDescription(next, [start + selected.length + 3, start + selected.length + 3 + url.length])
  }

  function insertDivider() {
    const node = descTextareaRef.current
    if (!node) return
    const start = node.selectionStart
    const end = node.selectionEnd
    const head = descDraft.slice(0, start)
    const tail = descDraft.slice(end)
    const lead = head && !head.endsWith('\n') ? '\n\n' : ''
    const trail = tail && !tail.startsWith('\n') ? '\n\n' : '\n'
    const insert = `${lead}---${trail}`
    updateDescription(head + insert + tail, [start + insert.length, start + insert.length])
  }

  // ------------------------------------------------- arrastre de checklists
  //
  // El asa tiene `touch-action: none`, así que el mismo gesto sirve con ratón,
  // dedo o lápiz. Mientras se arrastra se calcula el hueco con los rectángulos
  // ya pintados y al soltar se envía el índice al servidor.

  function setChecklistHintValue(next) {
    checklistHintRef.current = next
    setChecklistHint(next)
  }

  function setItemHintValue(next) {
    itemHintRef.current = next
    setItemHint(next)
  }

  function cancelListDrag() {
    dragStateRef.current = null
    setDragGhost(null)
    setChecklistHintValue(null)
    setItemHintValue(null)
  }

  function startChecklistDrag(event, checklist) {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = {
      kind: 'checklist',
      id: checklist.id,
      label: checklist.title,
      x: event.clientX,
      y: event.clientY,
    }
    setDragGhost({ kind: 'checklist', label: checklist.title, x: event.clientX, y: event.clientY })
    setChecklistHintValue(null)
    setItemHintValue(null)
  }

  function startItemDrag(event, item, checklist) {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = {
      kind: 'item',
      id: item.id,
      checklistId: checklist.id,
      label: item.text,
      x: event.clientX,
      y: event.clientY,
    }
    setDragGhost({ kind: 'item', label: item.text, x: event.clientX, y: event.clientY })
    setChecklistHintValue(null)
    setItemHintValue(null)
  }

  function computeListDragHint(x, y) {
    const state = dragStateRef.current
    if (!state) return

    if (state.kind === 'checklist') {
      // Fuera del modal (el fondo) el gesto se cancela en vez de mandar la
      // checklist al final sin querer.
      if (typeof document.elementFromPoint === 'function') {
        const hit = document.elementFromPoint(x, y)
        if (!hit || !hit.closest || !hit.closest('.card-modal')) {
          if (checklistHintRef.current !== null) setChecklistHintValue(null)
          return
        }
      }
      const rects = [...document.querySelectorAll('[data-checklist-id]')].map((el) => {
        const rect = el.getBoundingClientRect()
        return { top: rect.top, height: rect.height }
      })
      const index = dropIndexFromRects(rects, y)
      if (checklistHintRef.current !== index) setChecklistHintValue(index)
      return
    }

    const hit =
      typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null
    const checklistEl = hit && hit.closest ? hit.closest('[data-checklist-id]') : null
    if (!checklistEl) {
      if (itemHintRef.current) setItemHintValue(null)
      return
    }
    const checklistId = checklistEl.getAttribute('data-checklist-id')
    const rects = [...checklistEl.querySelectorAll('[data-item-id]')].map((el) => {
      const rect = el.getBoundingClientRect()
      return { top: rect.top, height: rect.height }
    })
    const index = dropIndexFromRects(rects, y)
    const prev = itemHintRef.current
    if (prev && prev.checklistId === checklistId && prev.index === index) return
    setItemHintValue({ checklistId, index })
  }

  function finishListDrag() {
    const state = dragStateRef.current
    const checklistIndex = checklistHintRef.current
    const itemDrop = itemHintRef.current
    cancelListDrag()
    if (!state || !card) return

    if (state.kind === 'checklist') {
      if (checklistIndex === null) return
      const from = card.checklists.findIndex((list) => list.id === state.id)
      if (from < 0) return
      const index = serverIndexFor(checklistIndex, { sameList: true, fromIndex: from })
      run(() => api.patch(`/checklists/${state.id}`, { targetIndex: index }))
      return
    }

    if (!itemDrop) return
    const source = card.checklists.find((list) => list.items.some((item) => item.id === state.id))
    if (!source) return
    const sameList = source.id === itemDrop.checklistId
    const fromIndex = sameList ? source.items.findIndex((item) => item.id === state.id) : -1
    const index = serverIndexFor(itemDrop.index, { sameList, fromIndex })
    run(() =>
      api.patch(`/checklist-items/${state.id}`, {
        checklistId: itemDrop.checklistId,
        targetIndex: index,
      })
    )
  }

  useEffect(() => {
    if (!dragGhost) return undefined
    const previousSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const onMove = (event) => {
      const state = dragStateRef.current
      if (!state) return
      state.x = event.clientX
      state.y = event.clientY
      setDragGhost((ghost) =>
        ghost ? { ...ghost, x: event.clientX, y: event.clientY } : ghost
      )
      computeListDragHint(event.clientX, event.clientY)
    }
    const onUp = () => {
      const state = dragStateRef.current
      if (state) computeListDragHint(state.x, state.y)
      finishListDrag()
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      cancelListDrag()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancelListDrag)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.style.userSelect = previousSelect
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancelListDrag)
      window.removeEventListener('keydown', onKey, true)
    }
    // Solo se reactiva al empezar o terminar un arrastre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(dragGhost)])

  const markdownTools = [
    { label: 'Negrita', icon: 'bold', action: () => applyInlineFormat('**') },
    { label: 'Cursiva', icon: 'italic', action: () => applyInlineFormat('_') },
    { label: 'Tachado', icon: 'strikethrough', action: () => applyInlineFormat('~~') },
    { label: 'Encabezado', icon: 'heading', action: () => applyLineFormat('# ') },
    { label: 'Lista', icon: 'list', action: () => applyLineFormat('- ') },
    { label: 'Checklist', icon: 'list-checks', action: () => applyLineFormat('- [ ] ') },
    { label: 'Cita', icon: 'quote', action: () => applyLineFormat('> ') },
    { label: 'Código', icon: 'code', action: () => applyInlineFormat('`', '`', 'código') },
    { label: 'Enlace', icon: 'link', action: applyLinkFormat },
    { label: 'Separador', icon: 'minus', action: insertDivider },
  ]

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

  const editingSomething = editingTitle || descEditing || editingComment !== null

  // Por defecto se guarda al salir del campo, pero solo cuando la pulsación
  // termina fuera: seleccionar texto (aunque el ratón acabe fuera del cuadro) o
  // un clic accidental no descartan lo que estás escribiendo.
  useDismissOnOutside({
    active: editingTitle,
    contains: (node) => Boolean(titleRef.current && titleRef.current.contains(node)),
    onDismiss: () => {
      const title = cleanTitle(titleDraft)
      setEditingTitle(false)
      if (title && title !== card.title) patch({ title })
    },
  })

  useDismissOnOutside({
    active: descEditing,
    contains: (node) => Boolean(descRef.current && descRef.current.contains(node)),
    onDismiss: () => {
      setDescEditing(false)
      if (descDraft !== (card.description || '')) patch({ description: descDraft })
    },
  })

  // Escape sale del campo que estás editando; solo cierra la tarjeta cuando no
  // hay nada abierto.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (editingTitle || descEditing) {
        setEditingTitle(false)
        setDescEditing(false)
        return
      }
      if (editingComment !== null) {
        setEditingComment(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingTitle, descEditing, editingComment, onClose])

  // El fondo solo cierra la tarjeta si la pulsación empezó y terminó ahí; si
  // había un editor abierto, el primer clic se limita a cerrarlo.
  const backdrop = useBackdropPress(() => onClose())

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
    <>
    <div
      className="modal-backdrop"
      onMouseDown={(event) => backdrop.onPointerDown(event, editingSomething)}
      onTouchStart={(event) => backdrop.onPointerDown(event, editingSomething)}
      onClick={backdrop.onClick}
    >
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
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-body">
          <div className="card-modal-main">
            <div className="card-title-block">
              {editingTitle ? (
                <div className="stack" data-card-title ref={titleRef}>
                  <input
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    maxLength={100}
                    autoFocus
                  />
                  <div className="row">
                    <button
                      className="btn primary small"
                      type="button"
                      disabled={busy || !cleanTitle(titleDraft)}
                      onClick={async () => {
                        await patch({ title: cleanTitle(titleDraft) })
                        setEditingTitle(false)
                      }}
                    >
                      <Icon name="save" size={14} />
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
                    setTitleDraft(cleanTitle(card.title))
                    setEditingTitle(true)
                  }}
                >
                  {cleanTitle(card.title)}
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
                <span className="meta-label">
                  <Icon name="calendar" size={13} />
                  Fecha de vencimiento
                </span>
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
                    <Icon name="calendar-clock" size={14} />
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
                        <Icon name="calendar-x" size={14} />
                        Quitar fecha
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="meta-col">
                <span className="meta-label">
                  <Icon name="flag" size={13} />
                  Prioridad
                </span>
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
                <span className="meta-label">
                  <Icon name="image" size={13} />
                  Fondo de la tarjeta
                </span>
                <div className="row wrap">
                  <ColorSelect
                    label="Color de fondo de la tarjeta"
                    title="Color de fondo de la tarjeta"
                    value={card.coverColor}
                    allowNone
                    noneLabel="Sin fondo"
                    displayLabel={coverStyle ? 'Imagen' : undefined}
                    onPick={(color) => patch({ coverColor: color, coverImage: null })}
                  />
                  <button
                    type="button"
                    className={`btn ghost small${coverStyle ? ' active-filter' : ''}`}
                    title="Imagen de fondo"
                    aria-label="Imagen de fondo"
                    onClick={() => setPanel(panel === 'cover' ? null : 'cover')}
                  >
                    <Icon name="image" size={14} />
                    Imagen
                  </button>
                </div>
                {panel === 'cover' && (
                  <div className="panel">
                    <p className="muted small">
                      Sube una imagen o pega su URL para usarla como fondo de la tarjeta.
                    </p>
                    <div className="row wrap">
                      <label className={`btn small${uploadingCover ? ' disabled' : ''}`}>
                        <Icon name={uploadingCover ? 'loader' : 'image'} size={14} className={uploadingCover ? 'spin' : ''} />
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
                          <Icon name="image-off" size={14} />
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
                        <Icon name="link" size={14} />
                        Usar URL
                      </button>
                    </form>

                    {card.coverImage && (
                      <div className="cover-position" data-cover-position>
                        <span className="muted small">
                          Encuadre de la imagen en la tarjeta
                        </span>
                        <div
                          className="cover-position-preview"
                          style={
                            coverStyle
                              ? {
                                  backgroundImage: coverStyle.backgroundImage,
                                  backgroundPosition: coverStyle.backgroundPosition,
                                }
                              : undefined
                          }
                        >
                          <div className="cover-position-grid">
                            {COVER_POSITION_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`cover-position-cell${
                                  (card.coverPosition || 'center') === option.value ? ' active' : ''
                                }`}
                                title={option.label}
                                aria-label={`Encuadrar la imagen: ${option.label}`}
                                aria-pressed={(card.coverPosition || 'center') === option.value}
                                onClick={() => patch({ coverPosition: option.value })}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="meta-col">
                <span className="meta-label">
                  <Icon name="tag" size={13} />
                  Etiquetas
                </span>
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
                    <Icon name="plus" size={14} />
                    Añadir
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
                <h3>
                  <Icon name="align-left" size={15} />
                  Descripción
                </h3>
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
                    <Icon name="pencil" size={14} />
                    Editar
                  </button>
                )}
              </div>

              {descEditing ? (
                <div className="desc-editor" data-card-desc ref={descRef}>
                  <div className="tabs">
                    <button
                      type="button"
                      className={descTab === 'write' ? 'tab active' : 'tab'}
                      onClick={() => setDescTab('write')}
                    >
                      <Icon name="pencil" size={14} />
                      Escribir
                    </button>
                    <button
                      type="button"
                      className={descTab === 'preview' ? 'tab active' : 'tab'}
                      onClick={() => setDescTab('preview')}
                    >
                      <Icon name="eye" size={14} />
                      Vista previa
                    </button>
                  </div>
                  {descTab === 'write' ? (
                    <>
                      <div className="desc-toolbar" role="toolbar" aria-label="Formato Markdown">
                        {markdownTools.map((tool) => (
                          <button
                            key={tool.label}
                            className="desc-tool"
                            type="button"
                            title={tool.label}
                            aria-label={tool.label}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={tool.action}
                          >
                            <Icon name={tool.icon} size={14} />
                          </button>
                        ))}
                      </div>
                      <textarea
                        ref={descTextareaRef}
                        rows={8}
                        value={descDraft}
                        onChange={(event) => setDescDraft(event.target.value)}
                        placeholder={'# Objetivo\n\n- [ ] primer paso\n- [x] paso hecho\n\n**negrita**, *cursiva*, `código` y [enlaces](https://ejemplo.com)'}
                        autoFocus
                      />
                    </>
                  ) : (
                    <div className="desc-preview">
                      <Markdown text={descDraft || '_Nada que previsualizar_'} />
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
                      <Icon name="save" size={14} />
                      Guardar
                    </button>
                    <button className="btn ghost small" type="button" onClick={() => setDescEditing(false)}>
                      <Icon name="x" size={14} />
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
                <h3>
                  <Icon name="list-checks" size={15} />
                  Checklists
                </h3>
              </div>

              {card.checklists.map((checklist, checklistIndex) => {
                const done = checklist.items.filter((item) => item.done).length
                const percent = checklist.items.length ? Math.round((done / checklist.items.length) * 100) : 0
                const showDropLine = dragGhost?.kind === 'checklist' && checklistHint === checklistIndex
                return (
                  <Fragment key={checklist.id}>
                  {showDropLine && <div className="drag-insert-line" aria-hidden="true" />}
                  <div className="checklist" data-checklist-id={checklist.id}>
                    <div className="checklist-head">
                      <button
                        className="drag-handle"
                        type="button"
                        title="Arrastrar checklist"
                        aria-label={`Mover el checklist «${checklist.title}»`}
                        onPointerDown={(event) => startChecklistDrag(event, checklist)}
                      >
                        <Icon name="grip-vertical" size={14} />
                      </button>
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
                        <Icon name="trash" size={14} />
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

                    <ul className="checklist-items" data-checklist-items={checklist.id}>
                      {checklist.items.map((item, itemIndex) => (
                        <Fragment key={item.id}>
                          {dragGhost?.kind === 'item' &&
                            itemHint?.checklistId === checklist.id &&
                            itemHint.index === itemIndex && (
                              <li className="drag-insert-line item-line" aria-hidden="true" />
                            )}
                          <li className={item.done ? 'item done' : 'item'} data-item-id={item.id}>
                            <button
                              className="drag-handle item-handle"
                              type="button"
                              title="Arrastrar elemento"
                              aria-label={`Mover «${item.text}»`}
                              onPointerDown={(event) => startItemDrag(event, item, checklist)}
                            >
                              <Icon name="grip-vertical" size={13} />
                            </button>
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() =>
                                run(() => api.patch(`/checklist-items/${item.id}`, { done: !item.done }))
                              }
                            />
                            <textarea
                              className="inline-title checklist-item-text"
                              rows={1}
                              defaultValue={item.text}
                              ref={growTextarea}
                              onInput={(event) => growTextarea(event.target)}
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
                              <Icon name="x" size={14} />
                            </button>
                          </li>
                        </Fragment>
                      ))}
                      {dragGhost?.kind === 'item' &&
                        itemHint?.checklistId === checklist.id &&
                        itemHint.index >= checklist.items.length && (
                          <li className="drag-insert-line item-line" aria-hidden="true" />
                        )}
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
                        <Icon name="plus" size={14} />
                        Añadir
                      </button>
                    </form>
                  </div>
                  </Fragment>
                )
              })}

              {dragGhost?.kind === 'checklist' && checklistHint >= card.checklists.length && (
                <div className="drag-insert-line" aria-hidden="true" />
              )}

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
                  <Icon name="list-plus" size={14} />
                  Añadir checklist
                </button>
              </form>
            </section>

            <section className="block">
              <div className="block-head">
                <h3>
                  <Icon name="message" size={15} />
                  Comentarios ({card.comments.length})
                </h3>
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
                      <Icon name="message" size={14} />
                      Comentar
                    </button>
                    {commentDraft && (
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => setCommentDraft('')}
                      >
                        <Icon name="eraser" size={14} />
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
                                <Icon name="save" size={14} />
                                Guardar
                              </button>
                              <button
                                className="btn ghost small"
                                type="button"
                                onClick={() => setEditingComment(null)}
                              >
                                <Icon name="x" size={14} />
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
                              <Icon name="pencil" size={14} />
                              Editar
                            </button>
                            <button
                              className="btn ghost small"
                              type="button"
                              onClick={() => run(() => api.del(`/comments/${comment.id}`))}
                            >
                              <Icon name="trash" size={14} />
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
              <span className="meta-label">
                <Icon name="users" size={13} />
                Miembros
              </span>
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
              <span className="meta-label">
                <Icon name="arrow-right" size={13} />
                Mover a lista
              </span>
              <select
                value={card.listId}
                onChange={(event) => patch({ listId: event.target.value, targetIndex: 0 })}
              >
                {board.lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="side-block">
              <span className="meta-label">
                <Icon name="zap" size={13} />
                Acciones
              </span>
              <div className="stack">
                <button
                  className="btn small"
                  type="button"
                  onClick={() => patch({ archived: !card.archived })}
                >
                  <Icon name={card.archived ? 'archive-restore' : 'archive'} size={14} />
                  {card.archived ? 'Restaurar tarjeta' : 'Archivar tarjeta'}
                </button>
                <button
                  className="btn small danger"
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Icon name="trash" size={14} />
                  Eliminar tarjeta
                </button>
              </div>
            </div>

            <div className="side-block">
              <span className="meta-label">
                <Icon name="history" size={13} />
                Actividad de la tarjeta
              </span>
              <ActivityFeed
                entries={card.activity}
                empty="Todavía no hay actividad en esta tarjeta."
              />
            </div>

            <div className="side-block">
              <span className="meta-label">
                <Icon name="history" size={13} />
                Fechas
              </span>
              <p className="muted small">Creada el {formatDateTime(card.createdAt)}</p>
              <p className="muted small">Actualizada el {formatDateTime(card.updatedAt)}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>

    {confirmDelete && (
      <ConfirmDialog
        title="Eliminar tarjeta"
        message={`¿Eliminar la tarjeta «${cleanTitle(card.title)}» definitivamente?`}
        confirmLabel="Eliminar tarjeta"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false)
          await run(() => api.del(`/cards/${card.id}`))
          onClose()
        }}
      />
    )}

    {dragGhost && (
      <div
        className={`drag-ghost ${dragGhost.kind}`}
        style={{ left: dragGhost.x + 14, top: dragGhost.y + 14 }}
        aria-hidden="true"
      >
        <Icon name="grip-vertical" size={12} />
        <span>{dragGhost.label}</span>
      </div>
    )}
    </>
  )
}
