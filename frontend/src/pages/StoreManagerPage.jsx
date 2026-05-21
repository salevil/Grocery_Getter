import { useCallback, useEffect, useState } from 'react'
import apiClient from '../services/apiClient'

/**
 * StoreManagerPage
 *
 * Lets household members manage the list of stores:
 *   - View all stores
 *   - Add a new store (inline form at the top)
 *   - Rename a store (inline edit on click)
 *   - Delete a store (with window.confirm)
 *   - 409 conflict errors shown inline
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export default function StoreManagerPage() {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Add-store form state
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Inline-edit state: { id, name } | null
  const [editing, setEditing] = useState(null)
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadStores = useCallback(async () => {
    setLoadError('')
    try {
      const { data } = await apiClient.get('/api/catalog/stores')
      setStores(data)
    } catch {
      setLoadError('Failed to load stores. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStores()
  }, [loadStores])

  // -------------------------------------------------------------------------
  // Add store
  // -------------------------------------------------------------------------

  async function handleAdd(e) {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)
    try {
      await apiClient.post('/api/catalog/stores', { name: newName.trim() })
      setNewName('')
      await loadStores()
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail
      if (status === 409) {
        setAddError('A store with that name already exists.')
      } else if (typeof detail === 'string') {
        setAddError(detail)
      } else {
        setAddError('Failed to add store. Please try again.')
      }
    } finally {
      setAddLoading(false)
    }
  }

  // -------------------------------------------------------------------------
  // Rename store
  // -------------------------------------------------------------------------

  function startEdit(store) {
    setEditing({ id: store.id, name: store.name })
    setEditError('')
  }

  function cancelEdit() {
    setEditing(null)
    setEditError('')
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    if (!editing) return
    setEditError('')
    setEditLoading(true)
    try {
      await apiClient.patch(`/api/catalog/stores/${editing.id}`, { name: editing.name.trim() })
      setEditing(null)
      await loadStores()
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail
      if (status === 409) {
        setEditError('A store with that name already exists.')
      } else if (typeof detail === 'string') {
        setEditError(detail)
      } else {
        setEditError('Failed to rename store. Please try again.')
      }
    } finally {
      setEditLoading(false)
    }
  }

  // -------------------------------------------------------------------------
  // Delete store
  // -------------------------------------------------------------------------

  async function handleDelete(store) {
    if (!window.confirm(`Delete "${store.name}"? This cannot be undone.`)) return
    try {
      await apiClient.delete(`/api/catalog/stores/${store.id}`)
      await loadStores()
    } catch {
      // Surface error inline — reload to show current state
      await loadStores()
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Loading stores…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-800">Manage Stores</h1>

        {/* Load error */}
        {loadError && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {loadError}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Add store form                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-3">Add a store</h2>
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Store name"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              disabled={addLoading || !newName.trim()}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {addLoading ? 'Adding…' : 'Add'}
            </button>
          </form>
          {addError && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {addError}
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Store list                                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="bg-white rounded-2xl shadow-md divide-y divide-gray-100">
          {stores.length === 0 ? (
            <p className="px-6 py-8 text-center text-gray-500 text-sm">
              No stores yet. Add one above.
            </p>
          ) : (
            stores.map((store) => (
              <div key={store.id} className="px-4 py-3">
                {editing?.id === store.id ? (
                  /* Inline edit row */
                  <form onSubmit={handleSaveEdit} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        autoFocus
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button
                        type="submit"
                        disabled={editLoading || !editing.name.trim()}
                        className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                      >
                        {editLoading ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    {editError && (
                      <p role="alert" className="text-sm text-red-600">
                        {editError}
                      </p>
                    )}
                  </form>
                ) : (
                  /* Normal row */
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(store)}
                      className="flex-1 text-left text-sm font-medium text-gray-800 hover:text-green-700 transition-colors truncate"
                      aria-label={`Rename ${store.name}`}
                    >
                      {store.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(store)}
                      aria-label={`Delete ${store.name}`}
                      className="flex-shrink-0 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}
