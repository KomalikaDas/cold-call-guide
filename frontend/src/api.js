const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// Render's free tier sleeps when idle and takes up to a minute to wake,
// so the timeout is generous.
async function request(path, { method = 'GET', body, timeout = 70000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    const message = err.name === 'AbortError'
      ? 'The server took too long to answer.'
      : 'Could not reach the server.'
    throw new ApiError(message, 0)
  } finally {
    clearTimeout(timer)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok) {
    let message = `Request failed (${response.status}).`
    if (typeof data?.detail === 'string') message = data.detail
    else if (Array.isArray(data?.detail)) message = 'Some of what was entered is not valid.'
    throw new ApiError(message, response.status)
  }
  return data
}

export const api = {
  health: () => request('/health', { timeout: 70000 }),
  startCall: (body) => request('/calls', { method: 'POST', body }),
  listCalls: (limit = 100) => request(`/calls?limit=${limit}`),
  getCall: (id) => request(`/calls/${id}`),
  saveStage: (id, body) => request(`/calls/${id}/stages`, { method: 'POST', body, timeout: 30000 }),
  checkCall: (id, body) => request(`/calls/${id}/check`, { method: 'POST', body, timeout: 45000 }),
  closeCall: (id, body) => request(`/calls/${id}/close`, { method: 'POST', body }),
}

export const apiBase = BASE
