import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import CardItem from '../components/CardItem.jsx'
import CardDetail from '../components/CardDetail.jsx'
import ContextMenu from '../components/ContextMenu.jsx'
import Icon from '../components/Icon.jsx'
import CalendarView from '../components/CalendarView.jsx'
import BoardActivityDialog from '../components/BoardActivityDialog.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import LabelsDialog from '../components/LabelsDialog.jsx'
import SearchDialog from '../components/SearchDialog.jsx'
import ColorSelect from '../components/ColorSelect.jsx'
import MembersDialog from '../components/MembersDialog.jsx'
import ArchivedDialog from '../components/ArchivedDialog.jsx'
import BoardBackgroundDialog from '../components/BoardBackgroundDialog.jsx'
import ProfileDialog from '../components/ProfileDialog.jsx'
import { boardArtwork } from '../lib/backgrounds.js'
import { LABEL_COLOR_HEX } from '../lib/constants.js'
import { listLimitStatus, listLimitTitle } from '../lib/listLimit.js'
import { useDismissOnOutside } from '../lib/editing.js'
import { clientId } from '../lib/clientId.js'
import { useBoardLive } from '../lib/live.js'
import {
  columnIndexFromRects,
  dropIndexFromRects,
  dropIndicatorOffset,
  resolveInsertIndex,
  serverIndexFor,
} from '../lib/dnd.js'

const EMPTY_FILTERS = { text: '', due: 'any', labelIds: [], memberIds: [] }

/** Listas plegadas guardadas en este dispositivo para un tablero. */
function readCollapsedLists(key) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export default function BoardPage() {
  const { boardId, cardId } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('board')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [dialog, setDialog] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [listMenu, setListMenu] = useState(null)
  const [limitDraft, setLimitDraft] = useState('')

  const [searchOpen, setSearchOpen] = useState(false)
  const menuWrapRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleRef = useRef(null)
  const [addingList, setAddingList] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [renamingList, setRenamingList] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameCancelRef = useRef(false)
  const [cardComposer, setCardComposer] = useState(null)
  const [cardDraft, setCardDraft] = useState('')
  const pendingCardScrollRef = useRef(null)

  const collapsedKey = `utrel:collapsed:${user.id}:${boardId}`
  const [collapsedLists, setCollapsedLists] = useState(() => readCollapsedLists(collapsedKey))
  const collapsedKeyRef = useRef(collapsedKey)

  const [drag, setDrag] = useState(null)
  const [cardDrop, setCardDrop] = useState(null)
  const [listDrop, setListDrop] = useState(null)
  const [touchGhost, setTouchGhost] = useState(null)
  const listsRef = useRef(null)
  const canvasRef = useRef(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const cardDropRef = useRef(null)
  const listDropRef = useRef(null)
  const dragRef = useRef(null)
  const justDraggedRef = useRef(false)
  const touchRef = useRef({ candidate: null, timer: null, startX: 0, startY: 0, x: 0, y: 0, active: false })
  const touchHandlersRef = useRef({ move: () => {}, end: () => {} })

  const refresh = useCallback(async () => {
    try {
      const payload = await api.get(`/boards/${boardId}`)
      setData(payload)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  // -------------------------------------------------------- sincronización

  const tabId = useRef(clientId())
  const liveRef = useRef({ timer: null, pending: false })

  /** Recarga el tablero por un cambio ajeno, sin pisar un arrastre en curso. */
  const syncFromServer = useCallback(() => {
    if (dragRef.current || touchRef.current.active) {
      liveRef.current.pending = true
      return
    }
    liveRef.current.pending = false
    refresh()
  }, [refresh])

  /** Varios avisos seguidos (mover tres tarjetas, por ejemplo) se agrupan en una recarga. */
  const scheduleSync = useCallback(() => {
    window.clearTimeout(liveRef.current.timer)
    liveRef.current.timer = window.setTimeout(syncFromServer, 200)
  }, [syncFromServer])

  useBoardLive({
    boardId,
    clientId: tabId.current,
    onChange: scheduleSync,
    onDeleted: () => {
      setError('Este tablero se ha eliminado')
      navigate('/')
    },
  })

  useEffect(() => () => window.clearTimeout(liveRef.current.timer), [])

  // Al volver a la app (iPad en segundo plano, otra pestaña) se refresca por si
  // se perdió algún aviso mientras la conexión estaba suspendida.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  /** Marca (o desmarca) la fecha de vencimiento de una tarjeta. */
  const toggleDueComplete = (cardId, dueComplete) =>
    guarded(() => api.patch(`/cards/${cardId}`, { dueComplete }))

  /**
   * Cambia el día de vencimiento al soltar una tarjeta en el calendario. Se
   * conserva la hora que ya tenía; si no tenía fecha, se asigna mediodía.
   */
  const moveCardDue = (cardId, key) => {
    const card = calendarCards.find((item) => item.id === cardId)
    if (!card) return
    const [year, month, day] = key.split('-').map(Number)
    if (!year || !month || !day) return
    const next = card.dueDate ? new Date(card.dueDate) : new Date()
    if (Number.isNaN(next.getTime())) return
    next.setFullYear(year, month - 1, day)
    next.setHours(card.dueDate ? next.getHours() : 12, card.dueDate ? next.getMinutes() : 0, 0, 0)
    guarded(() => api.patch(`/cards/${cardId}`, { dueDate: next.toISOString() }))
  }

  // Al crear una tarjeta, la lista se desplaza hasta el final para que la nueva
  // quede a la vista por encima del botón de añadir, nunca debajo de las demás.
  useEffect(() => {
    const listId = pendingCardScrollRef.current
    if (!listId || !data) return
    const container = document.querySelector(`[data-list-cards="${listId}"]`)
    if (!container) return
    pendingCardScrollRef.current = null
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    } else {
      container.scrollTop = container.scrollHeight
    }
  }, [data])

  // Al pulsar fuera, el compositor de tarjetas se cierra: si ya creaste la
  // tarjeta no hace falta darle a «Cancelar» para que no quede abierto.
  useEffect(() => {
    if (!cardComposer) return undefined
    const onOutside = (event) => {
      if (event.target.closest?.('[data-list-composer]')) return
      setCardComposer(null)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [cardComposer])

  // La edición en línea se guarda por defecto al salir del campo, pero solo
  // cuando la pulsación termina fuera: seleccionar texto y soltar el ratón
  // fuera (o un clic accidental) no cierra lo que estás escribiendo.
  useDismissOnOutside({
    active: editingTitle,
    contains: (node) => Boolean(titleRef.current && titleRef.current.contains(node)),
    onDismiss: () => {
      const title = titleDraft.replace(/\s+/g, ' ').trim().slice(0, 100)
      setEditingTitle(false)
      if (title && data.board.title !== title) guarded(() => api.patch(`/boards/${boardId}`, { title }))
    },
  })

  // El menú de la barra superior y el de cada lista se cierran al pulsar fuera,
  // como cualquier desplegable.
  useDismissOnOutside({
    active: menuOpen,
    contains: (node) => Boolean(menuWrapRef.current && menuWrapRef.current.contains(node)),
    onDismiss: () => setMenuOpen(false),
  })

  useDismissOnOutside({
    active: listMenu !== null,
    contains: (node) => {
      const wrap = typeof node?.closest === 'function' ? node.closest('[data-menu-wrap]') : null
      return Boolean(wrap) && wrap.getAttribute('data-menu-wrap') === listMenu
    },
    onDismiss: () => setListMenu(null),
  })

  // Escape cierra los desplegables abiertos, como cualquier menú.
  useEffect(() => {
    if (!menuOpen && listMenu === null) return undefined
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      setListMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, listMenu])

  /** Confirmación interna para las acciones destructivas (nada de window.confirm). */
  function askConfirm({ title, message, confirmLabel = 'Eliminar', onConfirm }) {
    setConfirmState({ title, message, confirmLabel, onConfirm })
  }

  // ----------------------------------------------------- menú contextual

  /** Abre el menú propio en lugar del del navegador (clic derecho). */
  function openContextMenu(event, items) {
    event.preventDefault()
    // En táctil la pulsación larga sirve para arrastrar: solo bloqueamos el menú de iOS.
    if (touchRef.current.active || touchRef.current.candidate) return
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, items })
  }

  const boardMenuItems = () => [
    { label: 'Buscar en el tablero…', icon: <Icon name="search" />, onSelect: () => setSearchOpen(true) },
    { label: 'Fondo del tablero…', icon: <Icon name="image" />, onSelect: () => setDialog('background') },
    { label: 'Etiquetas…', icon: <Icon name="tag" />, onSelect: () => setDialog('labels') },
    { label: 'Miembros…', icon: <Icon name="users" />, onSelect: () => setDialog('members') },
    { separator: true },
    {
      label: `Elementos archivados (${data.archivedCards.length + data.archivedLists.length})`,
      icon: <Icon name="archive" />,
      onSelect: () => setDialog('archived'),
    },
    {
      label: 'Actividad del tablero…',
      icon: <Icon name="history" />,
      onSelect: () => setDialog('activity'),
    },
    { separator: true },
    ...(data.board.ownerId === user.id
      ? [
          {
            label: 'Eliminar tablero',
            icon: <Icon name="trash" />,
            danger: true,
            onSelect: () =>
              askConfirm({
                title: 'Eliminar tablero',
                message: `¿Eliminar el tablero «${data.board.title}» y todas sus tarjetas?`,
                confirmLabel: 'Eliminar tablero',
                onConfirm: async () => {
                  await guarded(() => api.del(`/boards/${boardId}`))
                  navigate('/')
                },
              }),
          },
        ]
      : []),
  ]

  const listMenuItems = (list) => [
    { label: 'Añadir tarjeta', icon: <Icon name="plus" />, onSelect: () => setCardComposer(list.id) },
    {
      label: 'Renombrar lista',
      icon: <Icon name="pencil" />,
      onSelect: () => startRenameList(list),
    },
    {
      label: collapsedLists.has(list.id) ? 'Expandir lista' : 'Contraer lista',
      icon: <Icon name={collapsedLists.has(list.id) ? 'chevron-up' : 'chevron-down'} />,
      onSelect: () => toggleListCollapsed(list.id),
    },
    { separator: true },
    {
      label: 'Color y límite…',
      icon: <Icon name="tag" />,
      onSelect: () => {
        setLimitDraft(list.cardLimit ? String(list.cardLimit) : '')
        setListMenu(list.id)
      },
    },
    { separator: true },
    {
      label: 'Archivar lista',
      icon: <Icon name="archive" />,
      onSelect: () => guarded(() => api.patch(`/lists/${list.id}`, { archived: true })),
    },
    {
      label: 'Eliminar lista',
      icon: <Icon name="trash" />,
      danger: true,
      onSelect: () =>
        askConfirm({
          title: 'Eliminar lista',
          message: `¿Eliminar la lista «${list.title}» y sus tarjetas?`,
          confirmLabel: 'Eliminar lista',
          onConfirm: () => guarded(() => api.del(`/lists/${list.id}`)),
        }),
    },
  ]

  const cardMenuItems = (card) => [
    {
      label: 'Abrir tarjeta',
      icon: <Icon name="arrow-up-right" />,
      onSelect: () => navigate(`/b/${boardId}/c/${card.id}`),
    },
    {
      label: 'Archivar tarjeta',
      icon: <Icon name="archive" />,
      onSelect: () => guarded(() => api.patch(`/cards/${card.id}`, { archived: true })),
    },
    { separator: true },
    {
      label: 'Eliminar tarjeta',
      icon: <Icon name="trash" />,
      danger: true,
      onSelect: () =>
        askConfirm({
          title: 'Eliminar tarjeta',
          message: `¿Eliminar la tarjeta «${card.title}»?`,
          confirmLabel: 'Eliminar tarjeta',
          onConfirm: () => guarded(() => api.del(`/cards/${card.id}`)),
        }),
    },
  ]

  // ----------------------------------------------------------- búsqueda

  /**
   * La búsqueda vive en un modal y no filtra el tablero de fondo: al cerrarlo
   * se limpian los filtros para que la siguiente búsqueda empiece de cero.
   */
  function closeSearch() {
    setSearchOpen(false)
    setFilters(EMPTY_FILTERS)
  }

  useEffect(() => {
    if (!searchOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') closeSearch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  // El plegado de listas es una preferencia de vista: se guarda en este dispositivo.
  // (La escritura va antes que la lectura para no pisar el estado de otro tablero al cambiar de ruta.)
  useEffect(() => {
    if (collapsedKeyRef.current !== collapsedKey) return
    try {
      window.localStorage.setItem(collapsedKey, JSON.stringify([...collapsedLists]))
    } catch {
      /* almacenamiento no disponible (modo privado) */
    }
  }, [collapsedKey, collapsedLists])

  useEffect(() => {
    if (collapsedKeyRef.current === collapsedKey) return
    collapsedKeyRef.current = collapsedKey
    setCollapsedLists(readCollapsedLists(collapsedKey))
  }, [collapsedKey])

  /** Abre el renombrado en línea de una lista (y olvida cualquier cancelación previa). */
  function startRenameList(list) {
    renameCancelRef.current = false
    setRenamingList(list.id)
    setRenameDraft(list.title)
  }

  function toggleListCollapsed(listId, value) {
    setCollapsedLists((previous) => {
      const next = new Set(previous)
      const collapse = value === undefined ? !next.has(listId) : value
      if (collapse) next.add(listId)
      else next.delete(listId)
      return next
    })
  }

  const lists = useMemo(() => {
    if (!data) return []
    return data.lists.map((list) => ({ ...list, totalCards: list.cards.length }))
  }, [data])

  const calendarCards = useMemo(
    () => (data ? data.lists.flatMap((list) => list.cards) : []),
    [data]
  )

  /** Guarda el payload completo del tablero devuelto por la mayoría de endpoints. */
  const applyBoard = useCallback((payload) => {
    if (payload && payload.board && payload.lists) setData(payload)
    else refresh()
  }, [refresh])

  async function guarded(action, { silent = false } = {}) {
    try {
      const result = await action()
      applyBoard(result)
      if (!silent) setError('')
      return result
    } catch (err) {
      setError(err.message)
      refresh()
      return null
    }
  }

  // ------------------------------------------------------------ drag & drop

  const endDrag = () => {
    dragRef.current = null
    cardDropRef.current = null
    listDropRef.current = null
    setDrag(null)
    setCardDrop(null)
    setListDrop(null)
    setTouchGhost(null)
    // Si mientras arrastrábamos llegó un cambio de otro dispositivo, lo aplicamos ahora.
    if (liveRef.current.pending) {
      liveRef.current.pending = false
      refresh()
    }
  }

  function beginDrag(next, event) {
    dragRef.current = next
    setDrag(next)
    if (event) {
      pointerRef.current = { x: event.clientX, y: event.clientY }
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', next.id)
    }
  }

  function startCardDrag(event, card, listId) {
    // En táctil manda nuestro arrastre (el nativo de iOS es irregular): si hay una
    // pulsación larga en curso, cancelamos el dragstart del navegador.
    if (touchRef.current.candidate) {
      event.preventDefault()
      return
    }
    beginDrag({ type: 'card', id: card.id, listId }, event)
  }

  function startListDrag(event, list) {
    // Mientras se renombra la lista no se arrastra: el ratón selecciona texto.
    if (touchRef.current.candidate || renamingList === list.id) {
      event.preventDefault()
      return
    }
    beginDrag({ type: 'list', id: list.id }, event)
  }

  /** Contenedor de tarjetas más cercano en horizontal (para soltar fuera de las columnas). */
  function nearestCardsContainer(x) {
    let best = null
    for (const el of document.querySelectorAll('[data-list-cards]')) {
      // Las listas contraídas esconden sus tarjetas: no cuentan para soltar al vuelo.
      if (el.closest('[data-collapsed="true"]')) continue
      const rect = el.getBoundingClientRect()
      const distance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
      if (!best || distance < best.distance) best = { el, distance }
    }
    return best ? best.el : null
  }

  /**
   * Calcula dónde caería la tarjeta o la lista con la posición actual del puntero.
   * Se apoya en el DOM (no en los eventos dragover) para que también se actualice
   * mientras el tablero hace autoscroll.
   */
  function computeDropTarget() {
    const current = dragRef.current
    if (!current) return
    const { x, y } = pointerRef.current

    if (current.type === 'card') {
      const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null
      const section = hit && hit.closest ? hit.closest('[data-list-id]') : null

      // Sobre una lista contraída la tarjeta se añade al final de esa lista.
      if (section && section.getAttribute('data-collapsed') === 'true') {
        const listId = section.getAttribute('data-list-id')
        const target = lists.find((item) => item.id === listId)
        const index = target ? target.cards.length : 0
        const prev = cardDropRef.current
        if (prev && prev.listId === listId && prev.index === index && prev.y === 0) return
        const next = { listId, index, y: 0 }
        cardDropRef.current = next
        setCardDrop(next)
        return
      }

      const container = section ? section.querySelector('[data-list-cards]') : nearestCardsContainer(x)
      if (!container) return

      const listId = container.getAttribute('data-list-cards')
      const box = container.getBoundingClientRect()
      const rects = [...container.querySelectorAll('[data-card-id]')].map((el) => {
        const rect = el.getBoundingClientRect()
        return { top: rect.top, height: rect.height }
      })
      const pointerY = Math.min(Math.max(y, box.top), box.bottom)
      const index = dropIndexFromRects(rects, pointerY)
      const offset = dropIndicatorOffset(rects, index, box.top, container.scrollTop)

      const prev = cardDropRef.current
      if (prev && prev.listId === listId && prev.index === index && prev.y === offset) return
      const next = { listId, index, y: offset }
      cardDropRef.current = next
      setCardDrop(next)
      return
    }

    if (current.type === 'list' && listsRef.current) {
      const box = listsRef.current.getBoundingClientRect()
      const columns = [...listsRef.current.querySelectorAll('[data-list-id]')].map((el) => {
        const rect = el.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width }
      })
      const index = columnIndexFromRects(columns, x)
      const offset =
        index >= columns.length
          ? columns.length
            ? columns[columns.length - 1].right - box.left + 8
            : 8
          : columns[index].left - box.left - 8

      const prev = listDropRef.current
      if (prev && prev.index === index && prev.x === offset) return
      const next = { index, x: Math.max(0, offset) }
      listDropRef.current = next
      setListDrop(next)
    }
  }

  /** Desplaza el tablero al acercarse a los bordes mientras se arrastra. */
  function autoScroll() {
    const { x, y } = pointerRef.current
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const edge = 120
      let delta = 0
      if (x < rect.left + edge) delta = -Math.min(28, Math.ceil((rect.left + edge - x) / 5))
      else if (x > rect.right - edge) delta = Math.min(28, Math.ceil((x - (rect.right - edge)) / 5))
      if (delta) canvas.scrollLeft = Math.max(0, canvas.scrollLeft + delta)
    }

    if (!dragRef.current || dragRef.current.type !== 'card') return
    if (typeof document.elementFromPoint !== 'function') return
    const hit = document.elementFromPoint(x, y)
    const scroller = hit && hit.closest ? hit.closest('[data-list-cards]') : null
    if (scroller) {
      const rect = scroller.getBoundingClientRect()
      if (y < rect.top + 56) scroller.scrollTop -= 14
      else if (y > rect.bottom - 56) scroller.scrollTop += 14
    }
  }

  useEffect(() => {
    if (!drag) return undefined
    let frame = requestAnimationFrame(function tick() {
      autoScroll()
      computeDropTarget()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
    // El bucle se reinicia solo cuando empieza o termina un arrastre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  function onCanvasDragOver(event) {
    if (!dragRef.current) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    pointerRef.current = { x: event.clientX, y: event.clientY }
  }

  function onCanvasDrop(event) {
    const current = dragRef.current
    if (!current) return
    event.preventDefault()
    pointerRef.current = { x: event.clientX, y: event.clientY }
    computeDropTarget()

    const card = cardDropRef.current
    const list = listDropRef.current
    endDrag()

    if (current.type === 'card' && card) moveCard(current.id, card.listId, card.index)
    else if (current.type === 'list' && list) moveList(current.id, list.index)
  }

  // ------------------------------------------------------- arrastre táctil

  function resetTouchCandidate() {
    if (touchRef.current.timer) window.clearTimeout(touchRef.current.timer)
    touchRef.current = { candidate: null, timer: null, startX: 0, startY: 0, x: 0, y: 0, active: false }
  }

  function startTouchCandidate(event, candidate) {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    resetTouchCandidate()
    touchRef.current = {
      candidate,
      timer: window.setTimeout(activateTouchDrag, 220),
      startX: touch.clientX,
      startY: touch.clientY,
      x: touch.clientX,
      y: touch.clientY,
      active: false,
    }
  }

  function startCardTouch(event, card, listId) {
    // Los controles de la tarjeta (el círculo de completar) no arrancan el
    // arrastre: si no, en el iPad una pulsación lenta marcaría la fecha y
    // arrastraría la tarjeta a la vez.
    if (event.target.closest('button, input, textarea, select, form')) return
    startTouchCandidate(event, { type: 'card', id: card.id, listId, title: card.title })
  }

  function startListTouch(event, list) {
    if (event.target.closest('button, input, textarea, select, form')) return
    startTouchCandidate(event, { type: 'list', id: list.id, listId: list.id, title: list.title })
  }

  function activateTouchDrag() {
    const state = touchRef.current
    if (!state.candidate) return
    state.active = true
    state.timer = null
    pointerRef.current = { x: state.x, y: state.y }
    beginDrag({ type: state.candidate.type, id: state.candidate.id, listId: state.candidate.listId, touch: true })
    setTouchGhost({ x: state.x, y: state.y, title: state.candidate.title, type: state.candidate.type })
    if (navigator.vibrate) navigator.vibrate(12)
  }

  function handleTouchMove(event) {
    const state = touchRef.current
    if (!state.candidate) return
    const touch = event.touches[0]
    if (!touch) return

    state.x = touch.clientX
    state.y = touch.clientY

    if (!state.active) {
      const moved = Math.hypot(touch.clientX - state.startX, touch.clientY - state.startY)
      if (moved > 10) resetTouchCandidate()
      return
    }

    // Con el arrastre activo el dedo mueve la tarjeta, no la página.
    event.preventDefault()
    pointerRef.current = { x: touch.clientX, y: touch.clientY }
    setTouchGhost((ghost) => (ghost ? { ...ghost, x: touch.clientX, y: touch.clientY } : ghost))
  }

  function handleTouchEnd(event) {
    const state = touchRef.current
    if (!state.candidate) return

    if (!state.active) {
      resetTouchCandidate()
      return
    }

    // Evita el clic sintético justo después de soltar.
    if (event.cancelable) event.preventDefault()
    justDraggedRef.current = true
    window.setTimeout(() => {
      justDraggedRef.current = false
    }, 500)

    pointerRef.current = { x: state.x, y: state.y }
    computeDropTarget()

    const current = state.candidate
    const card = cardDropRef.current
    const list = listDropRef.current
    resetTouchCandidate()
    endDrag()

    if (current.type === 'card' && card) moveCard(current.id, card.listId, card.index)
    else if (current.type === 'list' && list) moveList(current.id, list.index)
  }

  useEffect(() => {
    touchHandlersRef.current = { move: handleTouchMove, end: handleTouchEnd }
  })

  useEffect(() => {
    const move = (event) => touchHandlersRef.current.move(event)
    const end = (event) => touchHandlersRef.current.end(event)
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end, { passive: false })
    document.addEventListener('touchcancel', end, { passive: false })
    return () => {
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
    }
  }, [])

  function moveCard(id, targetListId, domIndex) {
    const visibleTarget = lists.find((list) => list.id === targetListId)
    const fullTarget = data.lists.find((list) => list.id === targetListId)
    const source = data.lists.find((list) => list.cards.some((card) => card.id === id))
    if (!visibleTarget || !fullTarget || !source) return

    // El índice de arrastre cuenta tarjetas visibles; hay que traducirlo al de la lista completa
    // (con filtros activos, entre dos tarjetas visibles puede haber tarjetas ocultas).
    const insertAt = resolveInsertIndex(visibleTarget.cards, fullTarget.cards, domIndex)
    const sameList = source.id === targetListId
    const fromIndex = sameList ? source.cards.findIndex((card) => card.id === id) : -1
    const serverIndex = serverIndexFor(insertAt, { sameList, fromIndex })

    setData((prev) => {
      const next = prev.lists.map((list) => ({ ...list, cards: [...list.cards] }))
      let moved = null
      for (const list of next) {
        const position = list.cards.findIndex((card) => card.id === id)
        if (position >= 0) {
          moved = list.cards[position]
          list.cards.splice(position, 1)
          break
        }
      }
      if (!moved) return prev
      const destination = next.find((list) => list.id === targetListId)
      const at = Math.max(0, Math.min(serverIndex, destination.cards.length))
      destination.cards.splice(at, 0, { ...moved, listId: targetListId })
      return { ...prev, lists: next }
    })

    api
      .patch(`/cards/${id}`, { listId: targetListId, targetIndex: serverIndex })
      .then(() => refresh())
      .catch((err) => {
        setError(err.message)
        refresh()
      })
  }

  function moveList(id, domIndex) {
    const currentIndex = lists.findIndex((list) => list.id === id)
    let index = domIndex
    if (currentIndex >= 0 && currentIndex < domIndex) index -= 1
    index = Math.max(0, Math.min(index, lists.length - 1))

    setData((prev) => {
      const next = [...prev.lists]
      const from = next.findIndex((list) => list.id === id)
      if (from < 0) return prev
      const [moved] = next.splice(from, 1)
      next.splice(index, 0, moved)
      return { ...prev, lists: next }
    })

    api
      .patch(`/lists/${id}`, { targetIndex: index })
      .then((payload) => applyBoard(payload))
      .catch((err) => {
        setError(err.message)
        refresh()
      })
  }

  // ------------------------------------------------------------- mutaciones

  const createCard = async (listId) => {
    const title = cardDraft.trim()
    if (!title) return
    setCardDraft('')
    pendingCardScrollRef.current = listId
    const created = await guarded(() => api.post(`/lists/${listId}/cards`, { title }), {
      silent: true,
    })
    if (!created) pendingCardScrollRef.current = null
  }

  const createList = async (event) => {
    event.preventDefault()
    const title = newListTitle.trim()
    if (!title) return
    setNewListTitle('')
    setAddingList(false)
    await guarded(() => api.post(`/boards/${boardId}/lists`, { title }))
  }

  if (loading && !data) return <div className="app-loading">Cargando tablero…</div>
  if (!data) {
    return (
      <div className="app-loading">
        <div className="stack">
          <p className="form-error">{error || 'No se pudo cargar el tablero'}</p>
          <Link className="btn" to="/">
            Volver a mis tableros
          </Link>
        </div>
      </div>
    )
  }

  const { board, members } = data
  const isOwner = board.ownerId === user.id
  const artwork = boardArtwork(board)

  return (
    <div
      className={`board-page ${view === 'calendar' ? 'bg-plain' : artwork.className}`}
      style={view === 'calendar' ? undefined : artwork.style}
    >
      <header className="board-header" onContextMenu={(event) => openContextMenu(event, boardMenuItems())}>
        <div className="board-header-left">
          <Link className="btn ghost small" to="/">
            <Icon name="arrow-left" size={14} />
            Tableros
          </Link>
          {editingTitle ? (
            <form
              className="row"
              data-board-title
              ref={titleRef}
              onSubmit={async (event) => {
                event.preventDefault()
                const title = titleDraft.trim()
                setEditingTitle(false)
                if (title && title !== board.title) {
                  await guarded(() => api.patch(`/boards/${boardId}`, { title }))
                }
              }}
            >
              <input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} autoFocus />
              <button className="btn primary small" type="submit">
                Guardar
              </button>
              <button className="btn ghost small" type="button" onClick={() => setEditingTitle(false)}>
                Cancelar
              </button>
            </form>
          ) : (
            <h1
              className="board-title"
              title="Clic para editar el título"
              onClick={() => {
                setTitleDraft(board.title)
                setEditingTitle(true)
              }}
            >
              {board.title}
            </h1>
          )}
        </div>

        <div className="board-header-right">
          <div className="avatar-row">
            {members.slice(0, 5).map((member) => (
              <Avatar key={member.id} user={member} size={28} />
            ))}
          </div>

          <div className="segmented">
            <button
              type="button"
              className={view === 'board' ? 'segment active' : 'segment'}
              onClick={() => setView('board')}
              title="Vista de tablero"
            >
              <Icon name="layout-grid" size={14} />
              Tablero
            </button>
            <button
              type="button"
              className={view === 'calendar' ? 'segment active' : 'segment'}
              onClick={() => setView('calendar')}
              title="Vista de calendario"
            >
              <Icon name="calendar" size={14} />
              Calendario
            </button>
          </div>

          <button className="btn ghost small" type="button" onClick={() => setDialog('members')}>
            <Icon name="users" size={14} />
            Miembros
          </button>
          <button
            className="btn ghost small"
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Buscar tarjetas del tablero"
          >
            <Icon name="search" size={14} />
            Buscar
          </button>

          <div className="menu-wrap" ref={menuWrapRef}>
            <button
              className="btn ghost small"
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Icon name="more-horizontal" size={14} />
              Menú
            </button>
            {menuOpen && (
              <div className="popover right">
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => {
                    setDialog('archived')
                    setMenuOpen(false)
                  }}
                >
                  <Icon name="archive" size={14} />
                  Elementos archivados ({data.archivedCards.length + data.archivedLists.length})
                </button>
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => {
                    setDialog('activity')
                    setMenuOpen(false)
                  }}
                >
                  <Icon name="history" size={14} />
                  Actividad del tablero…
                </button>
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => {
                    setDialog('labels')
                    setMenuOpen(false)
                  }}
                >
                  <Icon name="tag" size={14} />
                  Etiquetas…
                </button>
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => {
                    setDialog('background')
                    setMenuOpen(false)
                  }}
                >
                  <Icon name="image" size={14} />
                  Fondo del tablero…
                </button>
                {isOwner && (
                  <button
                    className="btn ghost small danger"
                    type="button"
                    onClick={() =>
                      askConfirm({
                        title: 'Eliminar tablero',
                        message: `¿Eliminar el tablero «${board.title}» y todas sus tarjetas?`,
                        confirmLabel: 'Eliminar tablero',
                        onConfirm: async () => {
                          setMenuOpen(false)
                          await guarded(() => api.del(`/boards/${boardId}`))
                          navigate('/')
                        },
                      })
                    }
                  >
                    <Icon name="trash" size={14} />
                    Eliminar tablero
                  </button>
                )}
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => {
                    setDialog('profile')
                    setMenuOpen(false)
                  }}
                >
                  <Icon name="user" size={14} />
                  Mi perfil
                </button>
                {user.isAdmin && (
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/admin')
                    }}
                >
                  <Icon name="shield" size={14} />
                  Panel de administración
                </button>
                )}
                <button className="btn ghost small" type="button" onClick={() => logout()}>
                  <Icon name="log-out" size={14} />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <SearchDialog
          board={data}
          filters={filters}
          onChange={setFilters}
          onClose={closeSearch}
          onOpenCard={(id) => {
            closeSearch()
            navigate(`/b/${boardId}/c/${id}`)
          }}
        />
      )}

      {error && <p className="form-error board-alert">{error}</p>}

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

      {view === 'calendar' ? (
        <CalendarView
          cards={calendarCards}
          onOpenCard={(id) => navigate(`/b/${boardId}/c/${id}`)}
          onToggleDue={toggleDueComplete}
          onMoveCard={moveCardDue}
        />
      ) : (
        <div
          className="board-canvas"
          ref={canvasRef}
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
          onContextMenu={(event) => openContextMenu(event, boardMenuItems())}
        >
          <div className="lists" ref={listsRef}>
            {drag?.type === 'list' && listDrop && (
              <div className="list-drop-indicator" style={{ left: `${listDrop.x}px` }} />
            )}
            {lists.map((list) => (
              <div key={list.id} className="list-slot">
                <section
                  className={`list${drag?.type === 'list' && drag.id === list.id ? ' dragging' : ''}${
                    drag?.type === 'card' && cardDrop?.listId === list.id ? ' drop-target' : ''
                  }${collapsedLists.has(list.id) ? ' collapsed' : ''}${
                    list.color ? ' has-color' : ''
                  }`}
                  data-list-id={list.id}
                  data-collapsed={collapsedLists.has(list.id) ? 'true' : 'false'}
                  style={list.color ? { '--list-color': LABEL_COLOR_HEX[list.color] } : undefined}
                  onContextMenu={(event) => openContextMenu(event, listMenuItems(list))}
                >
                  {list.color && <div className={`list-accent bg-${list.color}`} />}

                  {collapsedLists.has(list.id) && (
                    <button
                      type="button"
                      className="list-collapsed"
                      title={`Expandir «${list.title}»`}
                      aria-label={`Expandir la lista ${list.title}`}
                      onClick={() => toggleListCollapsed(list.id, false)}
                    >
                      <span className="list-collapsed-title">{list.title}</span>
                      <span
                        className={`list-collapsed-count limit-${listLimitStatus(
                          list.totalCards,
                          list.cardLimit
                        )}`}
                        title={listLimitTitle(list.totalCards, list.cardLimit)}
                      >
                        {list.totalCards}
                        {list.cardLimit ? `/${list.cardLimit}` : ''}
                      </span>
                    </button>
                  )}
                  <header
                    className={`list-head${renamingList === list.id ? ' editing' : ''}`}
                    draggable={listMenu !== list.id && renamingList !== list.id}
                    onDragStart={(event) => startListDrag(event, list)}
                    onDragEnd={endDrag}
                    onTouchStart={(event) => startListTouch(event, list)}
                  >
                    {renamingList === list.id ? (
                      <form
                        className="row grow"
                        onSubmit={async (event) => {
                          event.preventDefault()
                          const title = renameDraft.trim()
                          renameCancelRef.current = false
                          setRenamingList(null)
                          if (title && title !== list.title) {
                            await guarded(() => api.patch(`/lists/${list.id}`, { title }))
                          }
                        }}
                      >
                        <input
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          autoFocus
                          onKeyDown={(event) => {
                            if (event.key !== 'Escape') return
                            event.stopPropagation()
                            renameCancelRef.current = true
                            setRenamingList(null)
                          }}
                          onBlur={(event) => {
                            if (renameCancelRef.current) {
                              return
                            }
                            const title = event.target.value.trim()
                            setRenamingList(null)
                            if (title && title !== list.title) {
                              guarded(() => api.patch(`/lists/${list.id}`, { title }))
                            }
                          }}
                        />
                      </form>
                    ) : (
                      <h3 className="list-title" onClick={() => startRenameList(list)}>
                        {list.title}
                      </h3>
                    )}
                    <span
                      className={`pill limit-${listLimitStatus(list.totalCards, list.cardLimit)}`}
                      title={listLimitTitle(list.totalCards, list.cardLimit)}
                    >
                      {list.totalCards}
                      {list.cardLimit ? `/${list.cardLimit}` : ''}
                    </span>
                    <div className="menu-wrap" data-menu-wrap={list.id}>
                      <button
                        className="btn ghost small"
                        type="button"
                        title={`Opciones de «${list.title}»`}
                        aria-haspopup="menu"
                        aria-expanded={listMenu === list.id}
                        aria-label={`Opciones de «${list.title}»`}
                        onClick={() => {
                          setLimitDraft(list.cardLimit ? String(list.cardLimit) : '')
                          setListMenu(listMenu === list.id ? null : list.id)
                        }}
                      >
                        <Icon name="more-vertical" size={15} />
                      </button>
                      {listMenu === list.id && (
                        <div className="popover right">
                          <button
                            className="btn ghost small"
                            type="button"
                            onClick={() => {
                              startRenameList(list)
                              setListMenu(null)
                            }}
                          >
                            <Icon name="pencil" size={14} />
                            Renombrar lista
                          </button>
                          <button
                            className="btn ghost small"
                            type="button"
                            onClick={() => {
                              setCardComposer(list.id)
                              setListMenu(null)
                            }}
                          >
                            <Icon name="plus" size={14} />
                            Añadir tarjeta
                          </button>
                          <button
                            className="btn ghost small"
                            type="button"
                            onClick={() => {
                              setListMenu(null)
                              toggleListCollapsed(list.id, true)
                            }}
                          >
                            <Icon name="chevron-down" size={14} />
                            Contraer lista
                          </button>
                          <button
                            className="btn ghost small"
                            type="button"
                            onClick={() => {
                              setListMenu(null)
                              guarded(() => api.patch(`/lists/${list.id}`, { archived: true }))
                            }}
                          >
                            <Icon name="archive" size={14} />
                            Archivar lista
                          </button>
                          <button
                            className="btn ghost small danger"
                            type="button"
                            onClick={() => {
                              setListMenu(null)
                              askConfirm({
                                title: 'Eliminar lista',
                                message: `¿Eliminar la lista «${list.title}» y sus tarjetas?`,
                                confirmLabel: 'Eliminar lista',
                                onConfirm: () => guarded(() => api.del(`/lists/${list.id}`)),
                              })
                            }}
                          >
                            <Icon name="trash" size={14} />
                            Eliminar lista
                          </button>
                          <div className="popover-section">
                            <span className="meta-label">Límite de tarjetas</span>
                            <form
                              className="row"
                              onSubmit={(event) => {
                                event.preventDefault()
                                const value = Number.parseInt(limitDraft, 10)
                                if (!Number.isInteger(value) || value < 1 || value > 999) return
                                setListMenu(null)
                                guarded(() => api.patch(`/lists/${list.id}`, { cardLimit: value }))
                              }}
                            >
                              <input
                                type="number"
                                min="1"
                                max="999"
                                placeholder="Sin límite"
                                value={limitDraft}
                                onChange={(event) => setLimitDraft(event.target.value)}
                              />
                              <button className="btn small" type="submit" disabled={!limitDraft.trim()}>
                                Guardar
                              </button>
                            </form>
                            {list.cardLimit ? (
                              <button
                                className="btn ghost small"
                                type="button"
                                onClick={() => {
                                  setListMenu(null)
                                  setLimitDraft('')
                                  guarded(() => api.patch(`/lists/${list.id}`, { cardLimit: null }))
                                }}
                              >
                                Quitar límite
                              </button>
                            ) : (
                              <span className="muted small">
                                Amarillo al quedar 3, rojo al llegar y morado al pasarse.
                              </span>
                            )}
                          </div>
                          <div className="popover-section">
                            <span className="meta-label">Color de la lista</span>
                            <ColorSelect
                              label="Color de la lista"
                              title="Color de la lista"
                              value={list.color}
                              allowNone
                              onPick={(color) => {
                                setListMenu(null)
                                guarded(() => api.patch(`/lists/${list.id}`, { color }))
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </header>

                  <div className="list-cards" data-list-cards={list.id}>
                    {drag?.type === 'card' && cardDrop?.listId === list.id && (
                      <div className="drop-indicator" style={{ top: `${cardDrop.y}px` }} />
                    )}

                    {list.cards.map((card) => (
                      <div key={card.id} className="card-slot">
                        <CardItem
                          card={card}
                          dragging={drag?.type === 'card' && drag.id === card.id}
                          onOpen={() => {
                            if (justDraggedRef.current) return
                            navigate(`/b/${boardId}/c/${card.id}`)
                          }}
                          onToggleDue={() => toggleDueComplete(card.id, !card.dueComplete)}
                          onDragStart={(event) => startCardDrag(event, card, list.id)}
                          onDragEnd={endDrag}
                          onTouchStart={(event) => startCardTouch(event, card, list.id)}
                          onContextMenu={(event) => openContextMenu(event, cardMenuItems(card))}
                        />
                      </div>
                    ))}

                    {list.cards.length === 0 && (
                      <p className="muted small list-empty">
                        {drag?.type === 'card'
                          ? 'Suelta aquí la tarjeta'
                          : 'Sin tarjetas'}
                      </p>
                    )}
                  </div>

                  <footer className="list-foot">
                    {cardComposer === list.id ? (
                      <form
                        className="stack"
                        data-list-composer={list.id}
                        onSubmit={async (event) => {
                          event.preventDefault()
                          await createCard(list.id)
                        }}
                      >
                        <textarea
                          rows={2}
                          placeholder="Título de la tarjeta…"
                          value={cardDraft}
                          onChange={(event) => setCardDraft(event.target.value)}
                          autoFocus
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              createCard(list.id)
                            }
                          }}
                        />
                        <div className="row">
                          <button className="btn primary small" type="submit">
                            Añadir tarjeta
                          </button>
                          <button className="btn ghost small" type="button" onClick={() => setCardComposer(null)}>
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        className="btn ghost wide"
                        type="button"
                        onClick={() => {
                          setCardComposer(list.id)
                          setCardDraft('')
                        }}
                      >
                        <Icon name="plus" size={14} />
                        Añadir tarjeta
                      </button>
                    )}
                  </footer>
                </section>
              </div>
            ))}

            {/* La lista nueva se nombra en su sitio: al final del tablero, como
                una columna más. Solo existe en la vista de tablero. */}
            <div className="list-slot new-list-slot">
              {addingList ? (
                <form className="list new-list-form" onSubmit={createList} data-new-list>
                  <input
                    placeholder="Título de la lista"
                    value={newListTitle}
                    onChange={(event) => setNewListTitle(event.target.value)}
                    autoFocus
                  />
                  <div className="row">
                    <button className="btn primary small" type="submit">
                      Añadir lista
                    </button>
                    <button className="btn ghost small" type="button" onClick={() => setAddingList(false)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  className="btn ghost small new-list-button"
                  type="button"
                  onClick={() => setAddingList(true)}
                  title="Añadir una lista al final del tablero"
                >
                  <Icon name="list-plus" size={14} />
                  Añadir lista
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {cardId && (
        <CardDetail
          cardId={cardId}
          board={data}
          currentUser={user}
          onClose={() => navigate(`/b/${boardId}`)}
          onBoardChange={refresh}
        />
      )}

      {dialog === 'labels' && (
        <LabelsDialog board={data} onClose={() => setDialog(null)} onBoardChange={applyBoard} />
      )}

      {dialog === 'members' && (
        <MembersDialog
          board={data}
          currentUser={user}
          onClose={() => setDialog(null)}
          onBoardChange={(partial) => {
            if (partial?.members) setData((prev) => ({ ...prev, members: partial.members }))
          }}
        />
      )}

      {dialog === 'activity' && (
        <BoardActivityDialog activity={data.activity} onClose={() => setDialog(null)} />
      )}

      {dialog === 'archived' && (
        <ArchivedDialog board={data} onClose={() => setDialog(null)} onBoardChange={refresh} />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {touchGhost && (
        <div
          className="touch-ghost"
          style={{ left: `${touchGhost.x}px`, top: `${touchGhost.y}px` }}
        >
          {touchGhost.type === 'list' ? `Lista: ${touchGhost.title}` : touchGhost.title}
        </div>
      )}

      {dialog === 'profile' && (
        <ProfileDialog onClose={() => setDialog(null)} onUpdated={() => refresh()} />
      )}

      {dialog === 'background' && (
        <BoardBackgroundDialog
          board={board}
          onClose={() => setDialog(null)}
          onApply={(payload) =>
            guarded(() => api.patch(`/boards/${boardId}`, payload)).then((result) => {
              if (!result?.board) throw new Error('No se pudo guardar el fondo')
              return result
            })
          }
        />
      )}
    </div>
  )
}
