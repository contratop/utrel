import { api } from '../api.js'

export default function ArchivedDialog({ board, onClose, onBoardChange }) {
  async function restoreCard(card) {
    await api.patch(`/cards/${card.id}`, { archived: false })
    onBoardChange()
  }

  async function restoreList(list) {
    await api.patch(`/lists/${list.id}`, { archived: false })
    onBoardChange()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Elementos archivados</h2>
          <button className="btn ghost small" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <section className="block">
          <h3>Listas archivadas ({board.archivedLists.length})</h3>
          <ul className="member-list">
            {board.archivedLists.map((list) => (
              <li key={list.id}>
                <span className="grow">{list.title}</span>
                <button className="btn small" type="button" onClick={() => restoreList(list)}>
                  Restaurar
                </button>
              </li>
            ))}
            {board.archivedLists.length === 0 && <li className="muted small">Ninguna.</li>}
          </ul>
        </section>

        <section className="block">
          <h3>Tarjetas archivadas ({board.archivedCards.length})</h3>
          <ul className="member-list">
            {board.archivedCards.map((card) => (
              <li key={card.id}>
                <span className="grow">
                  {card.title}
                  <span className="muted small"> · {card.listTitle || 'sin lista'}</span>
                </span>
                <button className="btn small" type="button" onClick={() => restoreCard(card)}>
                  Restaurar
                </button>
              </li>
            ))}
            {board.archivedCards.length === 0 && <li className="muted small">Ninguna.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
