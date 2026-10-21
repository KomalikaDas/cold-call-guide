import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { outcomeLabel, outcomeTone } from '../outcomes.js'
import { STAGES, stageByNumber } from '../stages.js'

export default function PastCalls({ serverState, active, justSaved, onResume, onNewCall }) {
  const [calls, setCalls] = useState(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)

  const load = useCallback(() => {
    setError('')
    api
      .listCalls(100)
      .then(setCalls)
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    load()
  }, [load, justSaved])

  const closed = (calls || []).filter((c) => c.status === 'closed')

  return (
    <section className="panel">
      {active && (
        <div className="banner">
          <span>
            You have an open call with <strong>{active.call.prospect_name}</strong>.
          </span>
          <button className="btn btn-small btn-accent" onClick={onResume}>
            Back to call
          </button>
        </div>
      )}
      {justSaved && (
        <div className="banner banner-ok">
          <span>
            Saved the call with <strong>{justSaved.prospect_name}</strong> as {outcomeLabel(justSaved.outcome)}.
          </span>
        </div>
      )}

      <div className="list-head">
        <div>
          <p className="eyebrow">Past calls</p>
          <h1 className="title">Where calls end</h1>
        </div>
        {!active && (
          <button className="btn btn-dark" onClick={onNewCall}>
            New call
          </button>
        )}
      </div>

      <StageStrip calls={closed} />

      {calls === null && !error && (
        <p className="muted pad">
          {serverState === 'waking' ? 'Waking the server. The free tier sleeps when idle; this can take a minute.' : 'Loading calls...'}
        </p>
      )}
      {error && (
        <p className="error pad">
          {error}{' '}
          <button className="linkbtn" onClick={load}>
            Try again
          </button>
        </p>
      )}
      {calls && calls.length === 0 && (
        <div className="empty">
          <p>No calls yet.</p>
          <p className="muted">Start one when you pick up the phone. Each saved call shows up here with the stage it reached.</p>
        </div>
      )}

      {calls && calls.length > 0 && (
        <ul className="calls">
          {calls.map((c) => (
            <CallRow
              key={c.id}
              call={c}
              isOpen={openId === c.id}
              isActive={active?.call.id === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function StageStrip({ calls }) {
  const counts = Object.fromEntries(STAGES.slice(0, 7).map((s) => [s.number, 0]))
  calls.forEach((c) => {
    if (counts[c.stage_reached] !== undefined) counts[c.stage_reached] += 1
  })
  const max = Math.max(1, ...Object.values(counts))
  return (
    <div className="strip" aria-label="How far saved calls got">
      {STAGES.slice(0, 7).map((s) => (
        <div key={s.number} className="strip-cell">
          <div className="strip-bar">
            <span style={{ height: `${(counts[s.number] / max) * 100}%` }} />
          </div>
          <span className="strip-count">{counts[s.number]}</span>
          <span className="strip-name">{s.name}</span>
        </div>
      ))}
    </div>
  )
}

function CallRow({ call, isOpen, isActive, onToggle }) {
  const stage = stageByNumber(call.stage_reached)
  const line = call.summary || call.next_step || (call.status === 'open' ? 'Not closed yet' : 'No summary')
  const differs = call.checked_outcome && call.outcome && call.checked_outcome !== call.outcome
  return (
    <li className={`callrow ${isOpen ? 'is-open' : ''}`}>
      <button className="callrow-main" onClick={onToggle} aria-expanded={isOpen}>
        <span className="callrow-who">
          <span className="callrow-name">
            {call.prospect_name}
            {call.company ? `, ${call.company}` : ''}
          </span>
          <span className="callrow-line">{line}</span>
          {differs && (
            <span className="callrow-flag">
              Logged {outcomeLabel(call.outcome)}; the record pointed to {outcomeLabel(call.checked_outcome)}
            </span>
          )}
        </span>
        <span className="callrow-side">
          <span className="callrow-stage">{stage?.name}</span>
          {call.status === 'open' ? (
            <span className="pill pill-open">{isActive ? 'In progress' : 'Not closed'}</span>
          ) : (
            <span className={`pill tone-${outcomeTone(call.outcome)}`}>{outcomeLabel(call.outcome)}</span>
          )}
          <span className="callrow-time">{formatWhen(call.started_at)}</span>
        </span>
      </button>
      {isOpen && <CallDetail id={call.id} />}
    </li>
  )
}

function CallDetail({ id }) {
  const [call, setCall] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.getCall(id).then(setCall).catch((err) => setError(err.message))
  }, [id])

  if (error) return <p className="error pad">{error}</p>
  if (!call) return <p className="muted pad">Loading...</p>
  return (
    <div className="detail">
      {call.next_step && (
        <p>
          <span className="label inline">Next step</span> {call.next_step}
        </p>
      )}
      {call.check_reason && (
        <p className="muted">
          <span className="label inline">Check</span> {call.check_reason}
        </p>
      )}
      {call.stage_results.length === 0 ? (
        <p className="muted">Nothing was recorded at any stage.</p>
      ) : (
        <ol className="detail-stages">
          {call.stage_results.map((r) => (
            <li key={r.stage}>
              <span className="record-stage">
                {r.stage} · {stageByNumber(r.stage)?.name}
              </span>
              <span>{r.happened || <span className="muted">Nothing tapped</span>}</span>
              {r.prospect_words && <span className="record-words">"{r.prospect_words}"</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay) return `Today ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}
