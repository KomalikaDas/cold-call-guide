import { useState } from 'react'
import { api } from '../api.js'
import { readJSON, writeJSON } from '../storage.js'

const CALLER_KEY = 'callguide.callerName'

export default function NewCall({ serverState, onStarted, onCancel }) {
  const [form, setForm] = useState({
    prospect_name: '',
    prospect_role: '',
    company: '',
    caller_name: readJSON(CALLER_KEY, ''),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.prospect_name.trim()) {
      setError('Add the name of the person you are calling.')
      return
    }
    setBusy(true)
    setError('')
    writeJSON(CALLER_KEY, form.caller_name.trim())
    try {
      const call = await api.startCall(form)
      onStarted(call)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">New call</p>
      <h1 className="title">Who are you calling?</h1>
      <p className="lede">Fill this in while the number rings. Only the name is needed.</p>

      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            autoFocus
            value={form.prospect_name}
            onChange={set('prospect_name')}
            placeholder="e.g. Ayesha Khan"
            maxLength={120}
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Role</span>
            <input value={form.prospect_role} onChange={set('prospect_role')} placeholder="e.g. Director" maxLength={120} />
          </label>
          <label className="field">
            <span className="field-label">Company</span>
            <input value={form.company} onChange={set('company')} placeholder="e.g. Vijay Writing Instruments" maxLength={160} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Your name</span>
          <input value={form.caller_name} onChange={set('caller_name')} placeholder="Remembered on this device" maxLength={80} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="submit" className="btn btn-dark" disabled={busy}>
            {busy ? (serverState === 'up' ? 'Starting...' : 'Waking the server...') : 'Start call'}
          </button>
          <button type="button" className="btn btn-plain" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
