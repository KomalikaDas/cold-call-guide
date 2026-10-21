import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { STAGES, stageByNumber } from '../stages.js'
import CloseCall from './CloseCall.jsx'

export default function CallScreen({ active, setActive, onFinished }) {
  const { call, stage, entries } = active
  const info = stageByNumber(stage)
  const entry = entries[stage] || {}
  const maxStage = active.maxStage || 1

  // Async saves read the newest state through this ref, not a stale closure.
  const latest = useRef(active)
  latest.current = active

  const [saveError, setSaveError] = useState('')
  const elapsed = useElapsed(active.startedAt)

  function updateEntry(n, patch) {
    setActive((a) => ({
      ...a,
      entries: { ...a.entries, [n]: { ...(a.entries[n] || {}), ...patch, saved: false } },
    }))
  }

  // Save one stage to the backend. Navigation never waits for this; if it
  // fails, the stage stays marked unsaved and is retried before closing.
  async function persist(n) {
    const snapshot = latest.current.entries[n] || {}
    if (snapshot.saved) return true
    const body = {
      stage: n,
      happened: snapshot.happened ?? null,
      tap_outcome: snapshot.outcome ?? null,
      prospect_words: snapshot.words ?? null,
    }
    try {
      await api.saveStage(call.id, body)
      setActive((a) => {
        if (!a || a.call.id !== call.id) return a
        const current = a.entries[n] || {}
        const changed =
          current.happened !== snapshot.happened ||
          current.outcome !== snapshot.outcome ||
          current.words !== snapshot.words
        if (changed) return a
        return { ...a, entries: { ...a.entries, [n]: { ...current, saved: true } } }
      })
      return true
    } catch (err) {
      setActive((a) => {
        if (!a || a.call.id !== call.id) return a
        return { ...a, entries: { ...a.entries, [n]: { ...(a.entries[n] || {}), saved: false } } }
      })
      setSaveError(`Stage ${n} is not saved yet: ${err.message} It will be tried again.`)
      return false
    }
  }

  async function flush() {
    const numbers = Object.keys(latest.current.entries).map(Number)
    const results = await Promise.all(numbers.map((n) => persist(n)))
    const ok = results.every(Boolean)
    if (ok) setSaveError('')
    return ok
  }

  function goTo(n) {
    if (n === stage) return
    persist(stage)
    setActive((a) => ({
      ...a,
      stage: n,
      maxStage: n < 8 ? Math.max(a.maxStage || 1, n) : a.maxStage || 1,
    }))
  }

  function tap(t) {
    const pressed = entry.happened === t.label
    updateEntry(stage, pressed ? { happened: null, outcome: null } : { happened: t.label, outcome: t.outcome ?? null })
  }

  const selectedTap = info.taps.find((t) => t.label === entry.happened)
  const nextInfo = stageByNumber(stage + 1)
  const unsavedCount = Object.values(entries).filter((e) => !e.saved).length

  return (
    <div className="call-layout">
      <section className="callcard" aria-label="Call guide">
        <div className="callcard-head">
          <span className="eyebrow">Meridian Growth Partners · call guide</span>
          <span className="timer" aria-label="Call time">{elapsed}</span>
        </div>

        <div className="prospect">
          <div className="prospect-name">{call.prospect_name}</div>
          <div className="prospect-meta">
            {[call.prospect_role, call.company].filter(Boolean).join(', ') || 'No company noted'}
          </div>
        </div>

        <ol className="pips" aria-label="Stages">
          {STAGES.map((s) => {
            const visited = s.number <= maxStage || entries[s.number]
            const cls = s.number === stage ? 'is-current' : visited ? 'is-visited' : ''
            return (
              <li key={s.number}>
                <button
                  className={`pip ${cls}`}
                  onClick={() => goTo(s.number)}
                  aria-current={s.number === stage ? 'step' : undefined}
                  title={s.name}
                >
                  {s.number}
                </button>
              </li>
            )
          })}
        </ol>

        {stage === 8 ? (
          <CloseCall
            active={active}
            setActive={setActive}
            onTap={tap}
            entry={entry}
            flush={flush}
            goTo={goTo}
            onFinished={onFinished}
          />
        ) : (
          <div className="stage">
            <p className="eyebrow muted">Stage {stage} of 8</p>
            <h2 className="stage-name">{info.title || info.name}</h2>
            <p className="stage-goal">{info.goal}</p>

            <p className="label">They may say</p>
            <ul className="mayhear">
              {info.mayHear.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="seen">{info.seen}</p>

            <p className="label">What happened</p>
            <div className="taps">
              {info.taps.map((t) => (
                <button
                  key={t.label}
                  className={`tap ${entry.happened === t.label ? 'is-pressed' : ''}`}
                  aria-pressed={entry.happened === t.label}
                  onClick={() => tap(t)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className={`words ${info.wordsMain ? 'is-main' : ''}`}>
              <span className="label">{info.wordsLabel}</span>
              {info.wordsHint && <span className="hint">{info.wordsHint}</span>}
              <textarea
                rows={info.wordsMain ? 4 : 2}
                value={entry.words || ''}
                maxLength={2000}
                onChange={(e) => updateEntry(stage, { words: e.target.value })}
                placeholder={info.wordsMain ? 'e.g. the biggest challenge is skilled manpower' : ''}
              />
            </label>

            {selectedTap?.ends && <p className="ends-hint">Calls usually end here after this. End the call when it does.</p>}

            <div className="stage-actions">
              <button className="btn btn-dark btn-grow" onClick={() => goTo(stage + 1)}>
                Next: {nextInfo.name}
              </button>
              <button
                className={`btn ${selectedTap?.ends ? 'btn-accent' : 'btn-outline'}`}
                onClick={() => goTo(8)}
              >
                End call
              </button>
            </div>
          </div>
        )}

        {saveError && unsavedCount > 0 && (
          <p className="save-error" role="alert">
            {saveError}{' '}
            <button className="linkbtn" onClick={flush}>
              Retry now
            </button>
          </p>
        )}
      </section>

      <CallRecord entries={entries} current={stage} onPick={goTo} />
    </div>
  )
}

function CallRecord({ entries, current, onPick }) {
  const rows = STAGES.filter((s) => entries[s.number]?.happened || entries[s.number]?.words)
  return (
    <aside className="record" aria-label="This call so far">
      <p className="eyebrow muted">This call so far</p>
      {rows.length === 0 ? (
        <p className="record-empty">Taps and their words show up here as you go.</p>
      ) : (
        <ol className="record-list">
          {rows.map((s) => {
            const e = entries[s.number]
            return (
              <li key={s.number} className={s.number === current ? 'is-current' : ''}>
                <button className="record-row" onClick={() => onPick(s.number)}>
                  <span className="record-stage">
                    {s.number} · {s.name}
                  </span>
                  {e.happened && <span className="record-tap">{e.happened}</span>}
                  {e.words && <span className="record-words">"{e.words}"</span>}
                  {!e.saved && s.number !== current && <span className="record-unsaved">not saved yet</span>}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}

function useElapsed(startedAt) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const seconds = Math.max(0, Math.floor((now - (startedAt || now)) / 1000))
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}
