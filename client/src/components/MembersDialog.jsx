import { useState } from 'react'
import { api } from '../api.js'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'

export default function MembersDialog({ board, currentUser, onClose, onBoardChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const isOwner = board.board.ownerId === currentUser.id

  async function search(value) {
    setQuery(value)
    setNotice('')
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    try {
      const data = await api.get(`/auth/users?q=${encodeURIComponent(value.trim())}`)
      setResults(data.users)
    } catch (err) {
      setError(err.message)
    }
  }

  async function add(username) {
    try {
      const data = await api.post(`/boards/${board.board.id}/members`, { username })
      onBoardChange({ members: data.members })
      setNotice(`@${username} se ha unido al tablero`)
      setResults([])
      setQuery('')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(userId, username) {
    try {
      const data = await api.del(`/boards/${board.board.id}/members/${userId}`)
      onBoardChange({ members: data.members })
      setNotice(`@${username} ya no tiene acceso`)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Miembros del tablero</h2>
          <button className="btn ghost small" type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar">
            <Icon name="x" size={15} />
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <ul className="member-list">
          {board.members.map((member) => (
            <li key={member.id}>
              <Avatar user={member} size={28} />
              <div className="grow">
                <strong>{member.name || member.username}</strong>
                <p className="muted small">
                  @{member.username} · {member.role === 'owner' ? 'Propietario' : 'Miembro'}
                </p>
              </div>
              {isOwner && member.role !== 'owner' && (
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => remove(member.id, member.username)}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>

        {isOwner ? (
          <div className="stack">
            <label className="field">
              <span>Invitar a un usuario registrado</span>
              <input
                placeholder="usuario o email"
                value={query}
                onChange={(event) => search(event.target.value)}
              />
            </label>
            {results.map((user) => (
              <div key={user.id} className="row between">
                <span className="row">
                  <Avatar user={user} size={24} /> @{user.username}
                </span>
                <button className="btn small" type="button" onClick={() => add(user.username)}>
                  Añadir al tablero
                </button>
              </div>
            ))}
            {query.trim().length >= 2 && results.length === 0 && (
              <p className="muted small">Sin resultados. El usuario debe registrarse primero en esta instancia.</p>
            )}
          </div>
        ) : (
          <p className="muted small">Solo el propietario del tablero puede gestionar los miembros.</p>
        )}
      </div>
    </div>
  )
}
