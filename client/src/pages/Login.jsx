import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ identifier: '', email: '', username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState(null)

  // Estado de la instancia: si el administrador cerró el registro público y si
  // todavía no hay ningún usuario (despliegue de cero, que empieza por su
  // administrador). Hasta saberlo no se enseña ni el acceso ni la bienvenida.
  useEffect(() => {
    let alive = true
    api
      .get('/auth/config')
      .then((data) => {
        if (!alive || !data) return
        setConfig({
          allowRegistration: data.allowRegistration !== false,
          needsSetup: !!data.needsSetup,
        })
      })
      .catch(() => {
        if (alive) setConfig({ allowRegistration: true, needsSetup: false })
      })
    return () => {
      alive = false
    }
  }, [])

  if (user) return <Navigate to={location.state?.from || '/'} replace />

  const allowRegistration = config ? config.allowRegistration : true
  const needsSetup = config ? config.needsSetup : false

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login({ identifier: form.identifier, password: form.password })
      } else {
        await register({
          email: form.email,
          username: form.username,
          password: form.password,
        })
      }
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function createAdmin(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register({
        email: form.email,
        username: form.username,
        password: form.password,
      })
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-mark" src="/brand/utrel-mark.svg" alt="" width="52" height="52" />
          <div>
            <h1>Utrel</h1>
            <p className="brand-tagline">Ultra-light Kanban</p>
          </div>
        </div>

        {!config ? (
          <p className="muted small">Comprobando el estado de la instancia…</p>
        ) : needsSetup ? (
          <>
            <div className="auth-welcome">
              <h2>Bienvenido a Utrel</h2>
              <p className="muted small">
                Esta instancia todavía no tiene usuarios. Crea aquí la cuenta del administrador:
                con ella gestionarás las cuentas, el registro y los tableros de todo el mundo.
              </p>
            </div>

            <form onSubmit={createAdmin} className="stack">
              <label className="field">
                <span>Usuario</span>
                <input
                  value={form.username}
                  onChange={update('username')}
                  autoComplete="username"
                  required
                  minLength={3}
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="field">
                <span>Contraseña</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={update('password')}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </label>

              {error && <p className="form-error">{error}</p>}

              <button className="btn primary wide" type="submit" disabled={busy}>
                {busy ? 'Creando…' : 'Crear el administrador y entrar'}
              </button>
            </form>

            <p className="muted small">El registro se abre o se cierra después desde el panel de administración.</p>
          </>
        ) : (
          <>
            <div className="tabs">
              <button
                type="button"
                className={mode === 'login' ? 'tab active' : 'tab'}
                onClick={() => setMode('login')}
              >
                Iniciar sesión
              </button>
              {allowRegistration && (
                <button
                  type="button"
                  className={mode === 'register' ? 'tab active' : 'tab'}
                  onClick={() => setMode('register')}
                >
                  Crear cuenta
                </button>
              )}
            </div>

            <form onSubmit={submit} className="stack">
              {mode === 'login' ? (
                <label className="field">
                  <span>Usuario o email</span>
                  <input
                    value={form.identifier}
                    onChange={update('identifier')}
                    autoComplete="username"
                    required
                    autoFocus
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Usuario</span>
                    <input
                      value={form.username}
                      onChange={update('username')}
                      autoComplete="username"
                      required
                      minLength={3}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={update('email')}
                      autoComplete="email"
                      required
                    />
                  </label>
                </>
              )}

              <label className="field">
                <span>Contraseña</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={update('password')}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                />
              </label>

              {error && <p className="form-error">{error}</p>}

              <button className="btn primary wide" type="submit" disabled={busy}>
                {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta y entrar'}
              </button>
            </form>

            <p className="muted small">
              {!allowRegistration
                ? 'El registro está cerrado en esta instancia. Pide al administrador que te cree una cuenta.'
                : mode === 'login'
                  ? 'Si aún no tienes cuenta, créala en «Crear cuenta».'
                  : 'Podrás invitar a otros usuarios a tus tableros por su nombre de usuario.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
