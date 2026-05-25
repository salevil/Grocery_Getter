import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import apiClient from '../services/apiClient'
import * as wsClient from '../services/wsClient'
import { enqueue, drain } from '../services/offlineQueue'
import BarcodeScanner from '../components/BarcodeScanner'
import { isPantryEnabled } from './PantryPage'

/**
 * ShoppingModePage
 *
 * Full-screen in-store check-off UI for a specific store's shopping list.
 *
 * Route: /lists/:storeId/shop
 *
 * Features:
 *   - Fetches list items for the store on mount
 *   - Connects to WebSocket for real-time collaboration
 *   - Tap item row → toggle checked (optimistic update)
 *   - "Scan to check off" → BarcodeScanner → match by UPC → check off + qty confirm
 *   - Offline banner + queue mutations when offline; drain on reconnect
 *   - "Clear checked" and "Reset list" bulk actions
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3
 */
export default function ShoppingModePage() {
  const { storeId } = useParams()
  const { t } = useTranslation()

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [items, setItems] = useState([])
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Offline state
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Barcode scanner
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanMessage, setScanMessage] = useState('') // "Not on your list" feedback

  // Bulk action feedback
  const [bulkError, setBulkError] = useState('')

  // Per-item errors
  const [itemErrors, setItemErrors] = useState({})

  // Quantity confirmation state after scan
  const [pendingQtyItem, setPendingQtyItem] = useState(null) // { item, newQty }
  const [qtyInput, setQtyInput] = useState('')

  // Track whether we've already drained on this online event
  const drainingRef = useRef(false)

  // -------------------------------------------------------------------------
  // Load list
  // -------------------------------------------------------------------------
  const loadList = useCallback(async () => {
    setLoadError('')
    try {
      const { data } = await apiClient.get('/api/lists')
      const sections = data.sections ?? []
      const section = sections.find(
        (s) => String(s.store_id) === String(storeId)
      )
      setItems(section?.items ?? [])
      setStoreName(section?.store_name ?? `Store ${storeId}`)
    } catch {
      setLoadError('Failed to load shopping list. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  // -------------------------------------------------------------------------
  // WebSocket event handler
  // -------------------------------------------------------------------------
  const handleWsEvent = useCallback((event) => {
    const { event: type, item_id, payload } = event

    switch (type) {
      case 'item_checked':
        setItems((prev) =>
          prev.map((i) => (i.id === item_id ? { ...i, checked: true } : i))
        )
        break

      case 'item_unchecked':
        setItems((prev) =>
          prev.map((i) => (i.id === item_id ? { ...i, checked: false } : i))
        )
        break

      case 'item_added':
        // Only add if it belongs to this store
        if (payload?.item && String(payload.item.store_id) === String(storeId)) {
          setItems((prev) => {
            // Avoid duplicates
            if (prev.some((i) => i.id === payload.item.id)) return prev
            return [...prev, payload.item]
          })
        }
        break

      case 'item_removed':
        setItems((prev) => prev.filter((i) => i.id !== item_id))
        break

      case 'item_qty_changed':
        setItems((prev) =>
          prev.map((i) =>
            i.id === item_id ? { ...i, quantity: payload?.quantity ?? i.quantity } : i
          )
        )
        break

      case 'list_cleared':
        // Remove all checked items for this store
        setItems((prev) => prev.filter((i) => !i.checked))
        break

      case 'list_reset':
        // Uncheck all items
        setItems((prev) => prev.map((i) => ({ ...i, checked: false })))
        break

      default:
        break
    }
  }, [storeId])

  // -------------------------------------------------------------------------
  // Mount / unmount — WebSocket lifecycle
  // -------------------------------------------------------------------------
  useEffect(() => {
    loadList()

    const token = localStorage.getItem('token')
    wsClient.connect(storeId, token, handleWsEvent)

    return () => {
      wsClient.disconnect()
    }
  }, [storeId, loadList, handleWsEvent])

  // -------------------------------------------------------------------------
  // Online / offline listeners
  // -------------------------------------------------------------------------
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      if (!drainingRef.current) {
        drainingRef.current = true
        drain(apiClient)
          .then(() => loadList())
          .finally(() => {
            drainingRef.current = false
          })
      }
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadList])

  // -------------------------------------------------------------------------
  // Item toggle (tap to check/uncheck)
  // -------------------------------------------------------------------------
  async function handleToggleChecked(item) {
    const newChecked = !item.checked
    const url = `/api/lists/items/${item.id}`
    const body = { checked: newChecked }

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, checked: newChecked } : i))
    )
    setItemErrors((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })

    if (!isOnline) {
      enqueue({ url, method: 'PATCH', body })
      return
    }

    try {
      await apiClient.patch(url, body)
      // When checking off, add the quantity to the pantry (best-effort, only if pantry enabled)
      if (newChecked && item.product?.id && isPantryEnabled()) {
        apiClient.post(
          `/api/pantry/delta?product_id=${item.product.id}`,
          { delta: item.quantity }
        ).catch(() => {}) // fire-and-forget, don't block the UI
      }
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i))
      )
      setItemErrors((prev) => ({ ...prev, [item.id]: 'Failed to update.' }))
    }
  }

  // -------------------------------------------------------------------------
  // Barcode scan handler
  // -------------------------------------------------------------------------
  function handleScan(upc) {
    setScannerOpen(false)
    setScanMessage('')

    const matched = items.find(
      (i) => i.product?.upc && String(i.product.upc) === String(upc)
    )

    if (!matched) {
      setScanMessage(`"${upc}" is not on your list.`)
      // Clear message after 3 seconds
      setTimeout(() => setScanMessage(''), 3000)
      return
    }

    // Open quantity confirmation
    setPendingQtyItem({ item: matched, newQty: matched.quantity })
    setQtyInput(String(matched.quantity))
  }

  async function confirmQtyAndCheck() {
    if (!pendingQtyItem) return
    const { item } = pendingQtyItem
    const qty = Math.max(1, parseInt(qtyInput, 10) || item.quantity)

    const url = `/api/lists/items/${item.id}`
    const body = { checked: true, quantity: qty }

    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, checked: true, quantity: qty } : i
      )
    )
    setPendingQtyItem(null)
    setQtyInput('')

    if (!isOnline) {
      enqueue({ url, method: 'PATCH', body })
      return
    }

    try {
      await apiClient.patch(url, body)
      // Add purchased quantity to pantry (best-effort, only if pantry enabled)
      if (item.product?.id && isPantryEnabled()) {
        apiClient.post(
          `/api/pantry/delta?product_id=${item.product.id}`,
          { delta: qty }
        ).catch(() => {})
      }
    } catch {
      // Revert
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, checked: item.checked, quantity: item.quantity }
            : i
        )
      )
      setItemErrors((prev) => ({ ...prev, [item.id]: 'Failed to check off scanned item.' }))
    }
  }

  function cancelQtyConfirm() {
    setPendingQtyItem(null)
    setQtyInput('')
  }

  // -------------------------------------------------------------------------
  // Bulk actions
  // -------------------------------------------------------------------------
  async function handleClearChecked() {
    setBulkError('')
    try {
      await apiClient.post(`/api/lists/${storeId}/clear-checked`)
      setItems((prev) => prev.filter((i) => !i.checked))
    } catch {
      setBulkError('Failed to clear checked items. Please try again.')
    }
  }

  async function handleResetList() {
    setBulkError('')
    try {
      await apiClient.post(`/api/lists/${storeId}/reset`)
      setItems((prev) => prev.map((i) => ({ ...i, checked: false })))
    } catch {
      setBulkError('Failed to reset list. Please try again.')
    }
  }

  // -------------------------------------------------------------------------
  // Derived counts
  // -------------------------------------------------------------------------
  const checkedCount = items.filter((i) => i.checked).length
  const totalCount = items.length

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Loading shopping list…</p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ------------------------------------------------------------------ */}
      {/* Offline banner                                                       */}
      {/* ------------------------------------------------------------------ */}
      {!isOnline && (
        <div
          role="alert"
          className="bg-yellow-400 text-yellow-900 text-sm font-medium text-center px-4 py-2"
        >
          You're offline — changes will sync when reconnected
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-14 z-10">
        <Link
          to="/lists"
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
          aria-label="Back to list"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to list
        </Link>

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-800 truncate">{storeName}</h1>
          <p className="text-xs text-gray-500">
            {checkedCount} / {totalCount} checked
          </p>
        </div>

        {/* Scan button */}
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors flex-shrink-0"
          aria-label="Scan to check off"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v1m0 14v1M4 12h1m14 0h1M6.343 6.343l.707.707M16.95 16.95l.707.707M6.343 17.657l.707-.707M16.95 7.05l.707-.707"
            />
          </svg>
          Scan
        </button>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Load error                                                           */}
      {/* ------------------------------------------------------------------ */}
      {loadError && (
        <div role="alert" className="mx-4 mt-4 rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {loadError}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Scan feedback message                                                */}
      {/* ------------------------------------------------------------------ */}
      {scanMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mx-4 mt-4 rounded-md bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 text-sm text-center font-medium"
        >
          {scanMessage}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Bulk action error                                                    */}
      {/* ------------------------------------------------------------------ */}
      {bulkError && (
        <div role="alert" className="mx-4 mt-4 rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {bulkError}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Item list                                                            */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-28">
        {items.length === 0 && !loadError ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 mb-3 opacity-40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-base font-medium">Nothing on the list</p>
            <p className="text-sm mt-1">Add items from the shopping list page.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleToggleChecked(item)}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl shadow-sm border transition-colors text-left ${
                    item.checked
                      ? 'bg-green-50 border-green-200'
                      : 'bg-white border-gray-100 hover:border-blue-200 active:bg-gray-50'
                  }`}
                  aria-pressed={item.checked}
                  aria-label={`${item.product?.name ?? 'Item'} — ${item.checked ? 'checked, tap to uncheck' : 'unchecked, tap to check'}`}
                >
                  {/* Checkbox indicator */}
                  <span
                    className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                      item.checked
                        ? 'bg-green-500 border-green-500'
                        : 'border-gray-300 bg-white'
                    }`}
                    aria-hidden="true"
                  >
                    {item.checked && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-base font-semibold truncate ${
                        item.checked ? 'line-through text-gray-400' : 'text-gray-800'
                      }`}
                    >
                      {item.product?.name ?? 'Unknown item'}
                    </p>
                    {item.product?.brand && (
                      <p className={`text-sm truncate ${item.checked ? 'text-gray-400' : 'text-gray-500'}`}>
                        {item.product.brand}
                      </p>
                    )}
                  </div>

                  {/* Quantity badge */}
                  <span
                    className={`flex-shrink-0 text-sm font-bold px-2.5 py-1 rounded-full ${
                      item.checked
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                    aria-label={`Quantity: ${item.quantity}`}
                  >
                    ×{item.quantity}
                  </span>
                </button>

                {/* Per-item error */}
                {itemErrors[item.id] && (
                  <p role="alert" className="mt-1 text-xs text-red-600 px-4">
                    {itemErrors[item.id]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom action bar                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 z-10">
        <button
          type="button"
          onClick={handleClearChecked}
          disabled={checkedCount === 0}
          className="flex-1 py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Clear checked items"
        >
          Clear checked ({checkedCount})
        </button>
        <button
          type="button"
          onClick={handleResetList}
          disabled={totalCount === 0}
          className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Reset list"
        >
          Reset list
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Barcode scanner modal                                                */}
      {/* ------------------------------------------------------------------ */}
      {scannerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Scan barcode to check off item"
          onClick={(e) => {
            if (e.target === e.currentTarget) setScannerOpen(false)
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Scan to check off</h2>
              <button
                type="button"
                onClick={() => setScannerOpen(false)}
                aria-label="Close scanner"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <BarcodeScanner
              onScan={handleScan}
              onClose={() => setScannerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Quantity confirmation modal (after scan match)                       */}
      {/* ------------------------------------------------------------------ */}
      {pendingQtyItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm quantity"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-800">
              Confirm quantity
            </h2>
            <p className="text-sm text-gray-600">
              <span className="font-medium">{pendingQtyItem.item.product?.name}</span> matched.
              How many are you putting in the cart?
            </p>
            <div className="flex items-center gap-3">
              <label htmlFor="qty-input" className="text-sm font-medium text-gray-700 flex-shrink-0">
                Quantity
              </label>
              <input
                id="qty-input"
                type="number"
                min="1"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={cancelQtyConfirm}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmQtyAndCheck}
                className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
              >
                Check off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
