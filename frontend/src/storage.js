// Small wrappers around localStorage. Some browsers block it (private mode,
// strict settings), and the app has to keep working when that happens.

export function readJSON(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key, value) {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do: the call still works, it just won't survive a reload.
  }
}
