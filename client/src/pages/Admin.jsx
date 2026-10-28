import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const EMPTY_FORM = { username: '', name: '', email: '', password: '', isAdmin: false }

const STAT_LABELS = [
  ['users', 'Usuarios'],
  ['admins', 'Administradores'],
  ['disabled', 'Cuentas deshabilitadas'],
  ['boards', 'Tableros activos'],
  ['lists', 'Listas'],
  ['cards', 'Tarjetas'],
  ['sessions', 'Sesiones abiertas'],
]

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Admin() {
  const { user, logout } = useAuth()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [resetFor, setResetFor] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [confirmUser, setConfirmUser] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api.get('/admin/overview')
      setOverview(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /** Ejecuta una acción del panel, recarga el estado y muestra el aviso. */
  async function run(action, message) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await load()
      setNotice(message)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function createUser(event) {
    event.preventDefault()
    const created = await run(
      () =>
        api.post('/admin/users', {
          username: form.username.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          isAdmin: form.isAdmin,
        }),
      `Usuario @${form.username.trim()} creado`
    )
    if (created) setForm(EMPTY_FORM)
  }

  return (
    <div className="admin-page">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/brand/utrel-mark.svg" alt="" width="30" height="30" />
          <strong>Utrel</strong>
          <span className="pill subtle">Panel de administración</span>
        </div>
        <div className="topbar-right">
          <Link className="btn ghost small" to="/">
            Volver a los tableros
          </Link>
          <button className="btn ghost small" type="button" onClick={() => logout()}>
            Salir
          </button>
        </div>
      </header>

      <main className="admin-main">
        {loading && <p className="muted">Cargando el panel…</p>}
        {error && <p className="form-error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        {overview && (
          <>
            <section className="admin-section">
              <div className="section-head">
                <div>
                  <h2>Registro de usuarios</h2>
                  <p className="muted small section-subtitle">
                    Controla si cualquiera puede crearse una cuenta desde la pantalla de acceso.
                  </p>
                </div>
              </div>
              <label className="check-row toggle-row">
                <input
                  type="checkbox"
                  checked={overview.settings.allowRegistration}
                  disabled={busy}
                  onChange={(event) =>
                    run(
                      () => api.patch('/admin/settings', { allowRegistration: event.target.checked }),
                      event.target.checked
                        ? 'Registro abierto: cualquiera puede crear una cuenta'
                        : 'Registro cerrado: solo el administrador da de alta cuentas'
                    )
                  }
                />
                <span>Permitir el registro de usuarios nuevos con invitación abierta</span>
              </label>
              <p className="muted small">
                Aunque esté cerrado, tú puedes seguir creando cuentas desde este panel.
              </p>
            </section>

            <section className="admin-section">
              <h2>Resumen de la instancia</h2>
              <div className="stat-grid">
                {STAT_LABELS.map(([key, label]) => (
                  <div className="stat-card" key={key}>
                    <span className="stat-value">{overview.stats[key]}</span>
                    <span className="muted small">{label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-section">
              <div className="section-head">
                <div>
                  <h2>Usuarios ({overview.users.length})</h2>
                  <p className="muted small section-subtitle">
                    {overview.stats.admins} administrador{overview.stats.admins === 1 ? '' : 'es'} en
                    total. No puedes quitarte tus propios permisos, así que la instancia siempre
                    conserva alguien que la gestione.
                  </p>
                </div>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, open: !prev.open }))}
                >
                  {form.open ? 'Cancelar alta' : 'Alta de usuario'}
                </button>
              </div>

              {form.open && (
                <form className="card-form admin-create" onSubmit={createUser}>
                  <div className="admin-form-grid">
                    <label className="field">
                      <span>Usuario</span>
                      <input
                        value={form.username}
                        onChange={(event) => setForm({ ...form, username: event.target.value })}
                        autoComplete="off"
                        minLength={3}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Nombre visible</span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        autoComplete="off"
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm({ ...form, email: event.target.value })}
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Contraseña inicial</span>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(event) => setForm({ ...form, password: event.target.value })}
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </label>
                  </div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={form.isAdmin}
                      onChange={(event) => setForm({ ...form, isAdmin: event.target.checked })}
                    />
                    <span>Dar permisos de administrador</span>
                  </label>
                  <div className="row">
                    <button className="btn primary" type="submit" disabled={busy}>
                      Crear usuario
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => setForm({ ...EMPTY_FORM, open: true })}
                    >
                      Limpiar
                    </button>
                  </div>
                </form>
              )}

              <ul className="admin-users">
                {overview.users.map((row) => {
                  const self = row.id === user.id
                  return (
                    <li key={row.id} className="admin-user" data-user-id={row.id}>
                      <div className="admin-user-row">
                        <Avatar user={row} size={38} />
                        <div className="admin-user-main">
                          <div className="row wrap">
                            <strong>{row.name || row.username}</strong>
                            <span className="muted small">@{row.username}</span>
                            {row.isAdmin && <span className="pill admin-flag">Administrador</span>}
                            {row.disabled && <span className="pill danger-flag">Deshabilitado</span>}
                            {self && <span className="pill subtle">Tú</span>}
                          </div>
                          <p className="muted small">{row.email}</p>
                          <p className="muted small">
                            Alta {formatDate(row.createdAt)} · {row.ownedBoards} tablero
                            {row.ownedBoards === 1 ? '' : 's'} propio
                            {row.ownedBoards === 1 ? '' : 's'} · {row.sharedBoards} compartido
                            {row.sharedBoards === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="admin-user-actions">
                          <button
                            className="btn ghost small"
                            type="button"
                            disabled={busy || self}
                            title={
                              self ? 'No puedes cambiar tu propio rol' : 'Cambiar permisos de administrador'
                            }
                            onClick={() =>
                              run(
                                () =>
                                  api.patch(`/admin/users/${row.id}`, { isAdmin: !row.isAdmin }),
                                row.isAdmin
                                  ? `@${row.username} ya no es administrador`
                                  : `@${row.username} es ahora administrador`
                              )
                            }
                          >
                            {row.isAdmin ? 'Quitar admin' : 'Hacer admin'}
                          </button>
                          <button
                            className="btn ghost small"
                            type="button"
                            disabled={busy || self}
                            onClick={() =>
                              run(
                                () => api.patch(`/admin/users/${row.id}`, { disabled: !row.disabled }),
                                row.disabled
                                  ? `@${row.username} puede volver a entrar`
                                  : `@${row.username} no podrá iniciar sesión`
                              )
                            }
                          >
                            {row.disabled ? 'Habilitar' : 'Deshabilitar'}
                          </button>
                          <button
                            className="btn ghost small"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setResetFor(resetFor?.id === row.id ? null : row)
                              setResetPassword('')
                            }}
                          >
                            Contraseña
                          </button>
                          <button
                            className="btn ghost small danger"
                            type="button"
                            disabled={busy || self}
                            onClick={() => setConfirmUser(row)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>

                      {resetFor?.id === row.id && (
                        <form
                          className="admin-reset row wrap"
                          onSubmit={async (event) => {
                            event.preventDefault()
                            const done = await run(
                              () =>
                                api.patch(`/admin/users/${row.id}`, { password: resetPassword }),
                              `Contraseña de @${row.username} actualizada`
                            )
                            if (done) {
                              setResetFor(null)
                              setResetPassword('')
                            }
                          }}
                        >
                          <input
                            type="password"
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            placeholder={`Nueva contraseña para @${row.username}`}
                            autoComplete="new-password"
                            minLength={8}
                            autoFocus
                            required
                          />
                          <button
                            className="btn primary small"
                            type="submit"
                            disabled={busy || resetPassword.length < 8}
                          >
                            Cambiar contraseña
                          </button>
                          <button
                            className="btn ghost small"
                            type="button"
                            onClick={() => setResetFor(null)}
                          >
                            Cancelar
                          </button>
                        </form>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        )}
      </main>

      {confirmUser && (
        <ConfirmDialog
          title="Eliminar cuenta"
          message={`¿Eliminar la cuenta de @${confirmUser.username} y los ${confirmUser.ownedBoards} tableros de los que es propietario? No se puede deshacer.`}
          confirmLabel="Eliminar cuenta"
          onCancel={() => setConfirmUser(null)}
          onConfirm={async () => {
            const target = confirmUser
            setConfirmUser(null)
            await run(
              () => api.del(`/admin/users/${target.id}`),
              `Cuenta @${target.username} eliminada`
            )
          }}
        />
      )}
    </div>
  )
}
