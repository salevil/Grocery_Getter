import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import apiClient from '../services/apiClient'
import BarcodeScanner from '../components/BarcodeScanner'

export default function PantryPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanMode, setScanMode] = useState('use') // 'use' | 'add'
  const [scanResult, setScanResult] = useState(null) // { item, upc }
  const [scanQty, setScanQty] = useState('1')
  const [scanError, setScanError] = useState('')

  // -------------------------------------------------------------------------
  // Load pantry
  // -------------------------------------------------------------------------
  const loadPantry = useCallback(async () => {
    setError('')
    try {
      const { data } = await apiClient.get('/api/pantry')
      setItems(data)
    } catch {
      setError('Failed to load pantry. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPantry() }, [loadPantry])

  // -------------------------------------------------------------------------
  // Manual quantity adjustment
  // -------------------------------------------------------------------------
  async function handleDelta(item, delta) {
    try {
      const { data } = await apiClient.post(
        `/api/pantry/delta?product_id=${item.product_id}`,
        { delta }
      )
      setItems((prev) => prev.map((i) => i.id === data.id ? data : i))
    } catch {
      // silently ignore — UI will be stale until next load
    }
  }

  async function handleSetQty(item, qty) {
    const n = parseInt(qty, 10)
    if (isNaN(n) || n < 0) return
    try {
      const { data } = await apiClient.post(
        `/api/pantry/adjust?product_id=${item.product_id}`,
        { quantity: n }
      )
      setItems((prev) => prev.map((i) => i.id === data.id ? data : i))
    } catch {
      // ignore
    }
  }

  // -------------------------------------------------------------------------
  // Barcode scan
  // -------------------------------------------------------------------------
  async function handleScan(upc) {
    setScannerOpen(false)
    setScanError('')
    try {
      const { data } = await apiClient.get(`/api/pantry/lookup/${upc}`)
      if (data) {
        setScanResult({ item: data, upc })
        setScanQty(scanMode === 'use' ? '1' : '1')
      } else {
        setScanError(`No product found for barcode "${upc}". Add it to your catalog first.`)
      }
    } catch {
      setScanError('Lookup failed. Please try again.')
    }
  }

  async function confirmScan() {
    if (!scanResult) return
    const qty = parseInt(scanQty, 10)
    if (isNaN(qty) || qty < 1) return
    const delta = scanMode === 'use' ? -qty : qty
    try {
      const { data } = await apiClient.post(
        `/api/pantry/delta?product_id=${scanResult.item.product_id}`,
        { delta }
      )
      setItems((prev) => {
        const exists = prev.find((i) => i.product_id === data.product_id)
        return exists ? prev.map((i) => i.product_id === data.product_id ? data : i) : [...prev, data]
      })
    } catch {
      // ignore
    }
    setScanResult(null)
    setScanQty('1')
  }

  // -------------------------------------------------------------------------
  // Add to shopping list
  // -------------------------------------------------------------------------
  async function handleAddToList(item) {
    try {
      await apiClient.post('/api/lists/items', { product_id: item.product_id, quantity: 1 })
    } catch {
      // ignore
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const outOfStock = items.filter((i) => i.quantity === 0)
  const inStock = items.filter((i) => i.quantity > 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Loading pantry…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Pantry</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setScanMode('use'); setScannerOpen(true); setScanError('') }}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
              Use item
            </button>
            <button
              type="button"
              onClick={() => { setScanMode('add'); setScannerOpen(true); setScanError('') }}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add stock
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
        )}

        {scanError && (
          <div role="alert" className="rounded-md bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 text-sm">{scanError}</div>
        )}

        {/* Suggestions — out of stock */}
        {outOfStock.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
              <h2 className="text-sm font-semibold text-amber-800">
                🛒 Suggestions — ran out ({outOfStock.length})
              </h2>
              <p className="text-xs text-amber-600 mt-0.5">These items are at 0. Add to your shopping list?</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {outOfStock.map((item) => (
                <li key={item.id} className="px-5 py-3 flex items-center gap-3">
                  {item.product.photo_url ? (
                    <img src={item.product.photo_url} alt={item.product.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
                    {item.product.brand && <p className="text-xs text-gray-500 truncate">{item.product.brand}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddToList(item)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
                  >
                    Add to list
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* In stock — grouped by category */}
        {inStock.length === 0 && outOfStock.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center text-gray-500">
            <p className="text-lg font-medium">Pantry is empty</p>
            <p className="text-sm mt-1">Scan items after shopping to track your stock.</p>
          </div>
        ) : inStock.length > 0 && (() => {
          const grouped = {}
          inStock.forEach((item) => {
            const cat = item.product.category || 'Uncategorized'
            if (!grouped[cat]) grouped[cat] = []
            grouped[cat].push(item)
          })
          const sortedCats = Object.keys(grouped).sort((a, b) =>
            a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b)
          )
          return (
            <div className="space-y-3">
              {sortedCats.map((cat) => (
                <div key={cat} className="bg-white rounded-2xl shadow-md overflow-hidden">
                  <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{cat} ({grouped[cat].length})</h2>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {grouped[cat].map((item) => (
                      <PantryRow key={item.id} item={item} onDelta={handleDelta} onSetQty={handleSetQty} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Scanner modal */}
      {scannerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setScannerOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {scanMode === 'use' ? 'Scan to use from pantry' : 'Scan to add to pantry'}
              </h2>
              <button type="button" onClick={() => setScannerOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <BarcodeScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />
          </div>
        </div>
      )}

      {/* Quantity confirmation after scan */}
      {scanResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-800">
              {scanMode === 'use' ? 'How many did you use?' : 'How many did you add?'}
            </h2>
            <p className="text-sm text-gray-600">
              <span className="font-medium">{scanResult.item.product.name}</span>
              {' '}— currently <span className="font-semibold">{scanResult.item.quantity}</span> in pantry
            </p>
            <div className="flex items-center gap-3">
              <label htmlFor="scan-qty" className="text-sm font-medium text-gray-700 flex-shrink-0">Quantity</label>
              <input
                id="scan-qty"
                type="number"
                min="1"
                value={scanQty}
                onChange={(e) => setScanQty(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setScanResult(null); setScanQty('1') }}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirmScan}
                className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row component with inline quantity editing
// ---------------------------------------------------------------------------
function PantryRow({ item, onDelta, onSetQty }) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(String(item.quantity))

  function handleBlur() {
    setEditing(false)
    onSetQty(item, editVal)
  }

  return (
    <li className="px-5 py-3 flex items-center gap-3">
      {item.product.photo_url ? (
        <img src={item.product.photo_url} alt={item.product.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
        {item.product.brand && <p className="text-xs text-gray-500 truncate">{item.product.brand}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button type="button" onClick={() => onDelta(item, -1)} disabled={item.quantity <= 0}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 font-bold text-sm transition-colors">
          −
        </button>
        {editing ? (
          <input
            type="number"
            min="0"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={handleBlur}
            autoFocus
            className="w-12 text-center text-sm font-semibold border border-green-400 rounded px-1 py-0.5 focus:outline-none"
          />
        ) : (
          <button type="button" onClick={() => { setEditing(true); setEditVal(String(item.quantity)) }}
            className="w-10 text-center text-sm font-semibold text-gray-700 hover:text-green-600 transition-colors"
            title="Tap to edit">
            {item.quantity}
          </button>
        )}
        <button type="button" onClick={() => onDelta(item, 1)}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors">
          +
        </button>
      </div>
    </li>
  )
}
