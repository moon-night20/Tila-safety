import { BrowserRouter, NavLink } from 'react-router-dom'
import { Alert24Regular, Chat24Regular, Home24Regular, Location24Regular, People24Regular, Timer24Regular } from '@fluentui/react-icons'
import { AppProvider } from './app/AppContext'
import AppRoutes from './app/AppRoutes'
import { useApp } from './app/AppContext'
import './App.css'

function Shell() {
  const { authStatus, signOut, setToast, toast } = useApp()
  const standalone = authStatus !== 'signed-in'
  if (standalone) return <main className="standalone"><AppRoutes /></main>
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <NavLink className="brand" to="/home" aria-label="Tila home"><span>T</span></NavLink>
        <nav>
          <NavLink to="/home"><Home24Regular /><span>Home</span></NavLink>
          <NavLink to="/timer/setup"><Timer24Regular /><span>Timer</span></NavLink>
          <NavLink to="/contacts"><People24Regular /><span>Contacts</span></NavLink>
          <NavLink to="/location"><Location24Regular /><span>Location</span></NavLink>
          <NavLink to="/assistant"><Chat24Regular /><span>Assistant</span></NavLink>
        </nav>
        <NavLink className="sos-link" to="/emergency"><Alert24Regular /><span>SOS</span></NavLink>
        <button className="signout-link" type="button" onClick={() => signOut().catch((error) => setToast(`Could not sign out: ${error.message}`))}>Sign out</button>
      </aside>
      <main className="main-content"><AppRoutes />{toast && <div className="toast-message" role="status">{toast}</div>}</main>
      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavLink to="/home"><Home24Regular /><span>Home</span></NavLink>
        <NavLink to="/timer/setup"><Timer24Regular /><span>Timer</span></NavLink>
        <NavLink to="/contacts"><People24Regular /><span>Contacts</span></NavLink>
        <NavLink to="/assistant"><Chat24Regular /><span>Assistant</span></NavLink>
      </nav>
    </div>
  )
}

export function ScreenHeader({ title, subtitle, back }) {
  return (
    <header className="screen-header">
      {back && <button className="back-button" type="button" onClick={back} aria-label="Go back">←</button>}
      <div><p className="eyebrow">TILA SAFETY</p><h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</div>
    </header>
  )
}

export function Dialog({ title, children, confirmLabel = 'Confirm', onConfirm, onCancel, danger = false }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2><div>{children}</div>
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className={`button ${danger ? 'danger' : 'primary'}`} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

export function StatusPill({ tone = 'purple', children }) {
  return <span className={`status-pill ${tone}`}><i />{children}</span>
}

export default function App() {
  return <BrowserRouter><AppProvider><Shell /></AppProvider></BrowserRouter>
}
