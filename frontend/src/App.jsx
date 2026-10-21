import { useEffect, useState } from 'react'
import { api } from './api.js'
import { readJSON, writeJSON } from './storage.js'
import NewCall from './components/NewCall.jsx'
import CallScreen from './components/CallScreen.jsx'
import PastCalls from './components/PastCalls.jsx'

const ACTIVE_KEY = 'callguide.activeCall'

export default function App() {
  const [active, setActive] = useState(() => readJSON(ACTIVE_KEY))
  const [view, setView] = useState(() => (readJSON(ACTIVE_KEY) ? 'call' : 'calls'))
  const [server, setServer] = useState('checking')
  const [justSaved, setJustSaved] = useState(null)

  // Keep an open call in the browser so a refresh mid-call loses nothing.
  useEffect(() => {
    writeJSON(ACTIVE_KEY, active)
  }, [active])

  // The backend sleeps on Render's free tier. Wake it as soon as the page
  // opens, and say so if it takes a while.
  useEffect(() => {
    let done = false
    const slow = setTimeout(() => {
      if (!done) setServer('waking')
    }, 2500)
    api
      .health()
      .then(() => setServer('up'))
      .catch(() => setServer('down'))
      .finally(() => {
        done = true
        clearTimeout(slow)
      })
    return () => clearTimeout(slow)
  }, [])

  function retryServer() {
    setServer('waking')
    api.health().then(() => setServer('up')).catch(() => setServer('down'))
  }

  function handleStarted(call) {
    setJustSaved(null)
    setActive({ call, stage: 1, entries: {}, startedAt: Date.now() })
    setView('call')
  }

  function handleFinished(closed) {
    setActive(null)
    setJustSaved(closed)
    setView('calls')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Meridian</span>
          <span className="brand-sub">call guide</span>
        </div>
        <ServerStatus state={server} onRetry={retryServer} />
        <nav className="topnav">
          <button
            className={`navlink ${view === 'calls' ? 'is-current' : ''}`}
            onClick={() => setView('calls')}
          >
            Past calls
          </button>
          {active ? (
            <button className="btn btn-small btn-accent" onClick={() => setView('call')}>
              Back to call
            </button>
          ) : (
            <button className="btn btn-small btn-dark" onClick={() => setView('new')}>
              New call
            </button>
          )}
        </nav>
      </header>

      <main className="main">
        {view === 'new' && !active && (
          <NewCall serverState={server} onStarted={handleStarted} onCancel={() => setView('calls')} />
        )}
        {view === 'call' && active && (
          <CallScreen active={active} setActive={setActive} onFinished={handleFinished} />
        )}
        {(view === 'calls' || (view === 'call' && !active) || (view === 'new' && active)) && (
          <PastCalls
            serverState={server}
            active={active}
            justSaved={justSaved}
            onResume={() => setView('call')}
            onNewCall={() => setView('new')}
          />
        )}
      </main>
    </div>
  )
}

function ServerStatus({ state, onRetry }) {
  const text = {
    checking: 'Connecting',
    waking: 'Waking the server, this can take a minute',
    up: 'Connected',
    down: 'Server not reachable',
  }[state]
  return (
    <div className={`status status-${state}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      <span className="status-text">{text}</span>
      {state === 'down' && (
        <button className="linkbtn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
