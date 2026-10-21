import { useState } from 'react'
import { api } from '../api.js'
import { OUTCOMES, outcomeLabel } from '../outcomes.js'
import { stageByNumber } from '../stages.js'

// The last tap that points at an outcome is the starting suggestion.
function outcomeFromTaps(entries) {
  for (let n = 7; n >= 1; n -= 1) {
    if (entries[n]?.outcome) return entries[n].outcome
  }
  return ''
}

export default function CloseCall({ active, setActive, onTap, entry, flush, goTo, onFinished }) {
  const { call, entries } = active
  const info = stageByNumber(8)
  const reached = active.maxStage || 1
  const close = active.close || {}
  const outcome = close.outcome ?? outcomeFromTaps(entries)
  const nextStep = close.nextStep ?? (entries[7]?.words || '')
  const needWords = entries[5]?.words?.trim()

  const [phase, setPhase] = useState('idle') // idle | checking | decide | saving
  const [check, setCheck] = useState(null)
  const [error, setError] = useState('')

  function setClose(patch) {
    setActive((a) => ({ ...a, close: { ...(a.close || {}), ...patch } }))
    // Anything changed after a check makes that check out of date.
    setCheck(null)
    setPhase('idle')
  }

  async function save(finalOutcome, result) {
    setPhase('saving')
    setError('')
    try {
      const closed = await api.closeCall(call.id, {
        outcome: finalOutcome,
        next_step: nextStep.trim() || null,
        summary: result?.summary || null,
        check: result,
      })
      onFinished(closed)
    } catch (err) {
      setError(err.message)
      setPhase(result && !result.matches ? 'decide' : 'idle')
    }
  }

  async function checkAndSave() {
    if (!outcome) {
      setError('Pick an outcome first.')
      return
    }
    setError('')
    setPhase('checking')
    const saved = await flush()
    if (!saved) {
      setError('Some stages could not be saved. Check the connection and try again.')
      setPhase('idle')
      return
    }
    try {
      const result = await api.checkCall(call.id, { outcome, next_step: nextStep.trim() || null })
      setCheck(result)
      if (result.matches) await save(outcome, result)
      else setPhase('decide')
    } catch (err) {
      setError(err.message)
      setPhase('idle')
    }
  }

  const busy = phase === 'checking' || phase === 'saving'

  return (
    <div className="stage">
      <p className="eyebrow muted">Stage 8 of 8</p>
      <h2 className="stage-name">{info.name}</h2>
      <p className="stage-goal">{info.goal}</p>

      {reached < 7 && (
        <p className="ended-at">
          Ended at stage {reached}, {stageByNumber(reached).name}.
        </p>
      )}

      <p className="label">They may say</p>
      <ul className="mayhear">
        {info.mayHear.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="seen">{info.seen}</p>

      <p className="label">How it ended</p>
      <div className="taps">
        {info.taps.map((t) => (
          <button
            key={t.label}
            className={`tap ${entry.happened === t.label ? 'is-pressed' : ''}`}
            aria-pressed={entry.happened === t.label}
            onClick={() => onTap(t)}
            disabled={busy}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="recap">
        <p className="label">Their words from stage 5</p>
        {needWords ? (
          <blockquote className="recap-quote">"{needWords}"</blockquote>
        ) : (
          <p className="recap-empty">
            Nothing written at stage 5.{' '}
            <button className="linkbtn" onClick={() => goTo(5)} disabled={busy}>
              Add it now
            </button>
          </p>
        )}
      </div>

      <fieldset className="outcomes" disabled={busy}>
        <legend className="label">Outcome</legend>
        <div className="outcome-grid">
          {OUTCOMES.map((o) => (
            <label key={o.key} className={`outcome tone-${o.tone} ${outcome === o.key ? 'is-picked' : ''}`}>
              <input
                type="radio"
                name="outcome"
                value={o.key}
                checked={outcome === o.key}
                onChange={() => setClose({ outcome: o.key })}
              />
              <span className="outcome-label">{o.label}</span>
              <span className="outcome-hint">{o.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="label">Next step</span>
        <input
          value={nextStep}
          maxLength={300}
          disabled={busy}
          onChange={(e) => setClose({ nextStep: e.target.value })}
          placeholder="e.g. Report on WhatsApp, call Thursday 10:30"
        />
      </label>

      {phase === 'decide' && check && (
        <div className="check check-differs" role="alert">
          <p className="check-title">
            The record points to <strong>{outcomeLabel(check.suggested_outcome)}</strong>, not{' '}
            <strong>{outcomeLabel(outcome)}</strong>.
          </p>
          {check.reason && <p className="check-reason">{check.reason}</p>}
          <div className="check-actions">
            <button className="btn btn-dark" onClick={() => save(check.suggested_outcome, check)}>
              Save as {outcomeLabel(check.suggested_outcome)}
            </button>
            <button className="btn btn-outline" onClick={() => save(outcome, check)}>
              Keep {outcomeLabel(outcome)}
            </button>
          </div>
          <p className="check-source">
            {check.source === 'model' ? 'Checked by Gemini against the taps and their words.' : 'Checked with simple rules; the model was not available.'}
          </p>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {phase !== 'decide' && (
        <div className="stage-actions">
          <button className="btn btn-dark btn-grow" onClick={checkAndSave} disabled={busy}>
            {phase === 'checking' ? 'Checking the record...' : phase === 'saving' ? 'Saving...' : 'Check and save call'}
          </button>
          <button className="btn btn-outline" onClick={() => goTo(Math.min(reached, 7))} disabled={busy}>
            Back
          </button>
        </div>
      )}
    </div>
  )
}
