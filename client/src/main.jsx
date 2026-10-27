import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// App instalable: el service worker guarda el armazón para abrir Utrel a
// pantalla completa desde el acceso directo (iPad, Android o escritorio).
// En desarrollo no se registra, para no cachear el código a medio editar.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sin service worker la app sigue funcionando */
    })
  })
}
