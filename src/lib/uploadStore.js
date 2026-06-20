// ── Global upload registry ────────────────────────────────────────────────────
// Module singleton: any upload anywhere in the app calls register/update/complete.
// React components subscribe via uploadStore.subscribe(fn).

let _nextId = 1

const _uploads = new Map()   // id → UploadEntry
const _listeners = new Set()

function _notify() {
  const all = [..._uploads.values()]
  _listeners.forEach((fn) => fn(all))
}

export const uploadStore = {
  /** Begin tracking a new upload. Returns a numeric id used in update/complete. */
  register(name, totalBytes) {
    const id = _nextId++
    _uploads.set(id, { id, name, total: totalBytes, loaded: 0, speed: 0, eta: null, done: false })
    _notify()
    return id
  },

  update(id, { loaded, speed, eta }) {
    const u = _uploads.get(id)
    if (!u || u.done) return
    _uploads.set(id, { ...u, loaded, speed: speed ?? u.speed, eta: eta ?? u.eta })
    _notify()
  },

  complete(id) {
    const u = _uploads.get(id)
    if (!u) return
    _uploads.set(id, { ...u, loaded: u.total, speed: 0, eta: 0, done: true })
    _notify()
    setTimeout(() => { _uploads.delete(id); _notify() }, 2500)
  },

  /** Subscribe to upload list changes. Returns an unsubscribe fn. */
  subscribe(fn) {
    _listeners.add(fn)
    fn([..._uploads.values()])   // immediate snapshot
    return () => _listeners.delete(fn)
  },
}
