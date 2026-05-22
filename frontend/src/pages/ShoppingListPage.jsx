import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../services/apiClient'

/**
 * ShoppingListPage
 *
 * Displays the household shopping list grouped by store. Each store section
 * is collapsible and shows list items with:
 *   - Checkbox (checked/unchecked) → PATCH /api/lists/items/{id}
 *   - Product name
 *   - Quantity stepper (− / +) → PATCH /api/lists/items/{id}
 *   - Remove button (×) → DELETE /api/lists/items/{id}
 *
 * Per-section actions:
 *   - "Add item" → modal to browse catalog → POST /api/lists/items
 *   - "Go shopping" → navigate to /lists/{storeId}/shop
 *
 * Navigation links at top: Catalog → /catalog, Stores → /stores
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4
 */
export default function ShoppingListPage() {
  const navigate = useNavigate()

  // Shopping list data: { sections: StoreListSection[] }
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Collapsed state per section: Set of store_id (null → 'unassigned')
  const [collapsed, setCollapsed] = useState(new Set())

  // Add-item modal state
  const [addModal, setAddModal] = useState(null) // { storeId, storeName } | null
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [addingProductId, setAddingProductId] = useState(null) // product id being added
  const [addError, setAddError] = useState('')

  // Inline operation errors keyed by item id
  const [itemErrors, setItemErrors] = useState({})

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadList = useCallback(async () => {
    setLoadError('')
    try {
      const { data } = await apiClient.get('/api/lists')
      setSections(data.sections ?? [])
    } catch {
      setLoadError('Failed to load shopping list. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  // -------------------------------------------------------------------------
  // Section collapse toggle
  // -------------------------------------------------------------------------

  function toggleCollapse(sectionKey) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(sectionKey)) {
        next.delete(sectionKey)
      } else {
        next.add(sectionKey)
      }
      return next
    })
  }

  function sectionKey(section) {
    return section.store_id ?? 'unassigned'
  }

  // -------------------------------------------------------------------------
  // Item operations
  // -------------------------------------------------------------------------

  function clearItemError(itemId) {
    setItemErrors((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  async function handleToggleChecked(item) {
    clearItemError(item.id)
    // Optimistic update
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        items: section.items.map((i) =>
          i.id === item.id ? { ...i, checked: !i.checked } : i
        ),
      }))
    )
    try {
      await apiClient.patch(`/api/lists/items/${item.id}`, {
        checked: !item.checked,
      })
    } catch {
      // Revert optimistic update on failure
      setSections((prev) =>
        prev.map((section) => ({
          ...section,
          items: section.items.map((i) =>
            i.id === item.id ? { ...i, checked: item.checked } : i
          ),
        }))
      )
      setItemErrors((prev) => ({ ...prev, [item.id]: 'Failed to update.' }))
    }
  }

  async function handleQuantityChange(item, delta) {
    const newQty = Math.max(1, item.quantity + delta)
    if (newQty === item.quantity) return
    clearItemError(item.id)
    // Optimistic update
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        items: section.items.map((i) =>
          i.id === item.id ? { ...i, quantity: newQty } : i
        ),
      }))
    )
    try {
      await apiClient.patch(`/api/lists/items/${item.id}`, { quantity: newQty })
    } catch {
      // Revert
      setSections((prev) =>
        prev.map((section) => ({
          ...section,
          items: section.items.map((i) =>
            i.id === item.id ? { ...i, quantity: item.quantity } : i
          ),
        }))
      )
      setItemErrors((prev) => ({ ...prev, [item.id]: 'Failed to update quantity.' }))
    }
  }

  async function handleRemoveItem(item) {
    clearItemError(item.id)
    // Optimistic removal
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        items: section.items.filter((i) => i.id !== item.id),
      }))
    )
    try {
      await apiClient.delete(`/api/lists/items/${item.id}`)
    } catch {
      // Reload to restore state on failure
      await loadList()
      setItemErrors((prev) => ({ ...prev, [item.id]: 'Failed to remove item.' }))
    }
  }

  // -------------------------------------------------------------------------
  // Add item modal
  // -------------------------------------------------------------------------

  async function openAddModal(section) {
    setAddModal({ storeId: section.store_id, storeName: section.store_name })
    setAddError('')
    setAddingProductId(null)
    setCatalog([])
    setCatalogLoading(true)
    setCatalogError('')
    try {
      const { data } = await apiClient.get('/api/catalog/products')
      setCatalog(data)
    } catch {
      setCatalogError('Failed to load catalog. Please try again.')
    } finally {
      setCatalogLoading(false)
    }
  }

  function closeAddModal() {
    setAddModal(null)
    setCatalog([])
    setAddError('')
    setAddingProductId(null)
  }

  async function handleAddProduct(product) {
    setAddingProductId(product.id)
    setAddError('')
    try {
      await apiClient.post('/api/lists/items', {
        product_id: product.id,
        quantity: 1,
      })
      closeAddModal()
      await loadList()
    } catch (err) {
      const detail = err.response?.data?.detail
      setAddError(
        typeof detail === 'string' ? detail : 'Failed to add item. Please try again.'
      )
    } finally {
      setAddingProductId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Loading shopping list…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ---------------------------------------------------------------- */}
        {/* Header + navigation links                                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Shopping List</h1>
          <button
            type="button"
            onClick={() => openAddModal({ store_id: null, store_name: null })}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add item
          </button>
        </div>

        {/* Load error */}
        {loadError && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {loadError}
          </div>
        )}

        {/* Empty state */}
        {sections.length === 0 && !loadError && (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center text-gray-500 space-y-4">
            <p className="text-lg font-medium">Your list is empty</p>
            <p className="text-sm">Tap the button above or below to add products from your catalog.</p>
            <button
              type="button"
              onClick={() => openAddModal({ store_id: null, store_name: null })}
              className="mx-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add item
            </button>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Store sections                                                    */}
        {/* ---------------------------------------------------------------- */}
        {sections.map((section) => {
          const key = sectionKey(section)
          const isCollapsed = collapsed.has(key)
          const isUnassigned = section.store_id === null

          return (
            <div
              key={key}
              className="bg-white rounded-2xl shadow-md overflow-hidden"
            >
              {/* Section header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => toggleCollapse(key)}
                  className="flex items-center gap-2 flex-1 text-left"
                  aria-expanded={!isCollapsed}
                  aria-controls={`section-${key}`}
                >
                  {/* Chevron */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="font-semibold text-gray-800">
                    {section.store_name ?? 'Unassigned'}
                  </span>
                  <span className="ml-1 text-xs text-gray-400 font-normal">
                    ({section.items.length} {section.items.length === 1 ? 'item' : 'items'})
                  </span>
                </button>

                {/* Section actions */}
                <div className="flex items-center gap-2 ml-3">
                  {/* Add item button */}
                  <button
                    type="button"
                    onClick={() => openAddModal(section)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
                    aria-label={`Add item to ${section.store_name ?? 'Unassigned'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add item
                  </button>

                  {/* Go shopping button (only for named stores) */}
                  {!isUnassigned && (
                    <button
                      type="button"
                      onClick={() => navigate(`/lists/${section.store_id}/shop`)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                      aria-label={`Go shopping at ${section.store_name}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Go shopping
                    </button>
                  )}
                </div>
              </div>

              {/* Section items */}
              {!isCollapsed && (
                <ul id={`section-${key}`} className="divide-y divide-gray-50">
                  {section.items.length === 0 ? (
                    <li className="px-5 py-4 text-sm text-gray-400 text-center">
                      No items yet — add one above.
                    </li>
                  ) : (
                    section.items.map((item) => (
                      <li key={item.id} className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => handleToggleChecked(item)}
                            aria-label={`Mark ${item.product.name} as ${item.checked ? 'unchecked' : 'checked'}`}
                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer flex-shrink-0"
                          />

                          {/* Product name */}
                          <span
                            className={`flex-1 text-sm font-medium truncate ${
                              item.checked ? 'line-through text-gray-400' : 'text-gray-800'
                            }`}
                          >
                            {item.product.name}
                            {item.product.brand && (
                              <span className="ml-1 font-normal text-gray-400">
                                {item.product.brand}
                              </span>
                            )}
                          </span>

                          {/* Quantity stepper */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(item, -1)}
                              disabled={item.quantity <= 1}
                              aria-label={`Decrease quantity of ${item.product.name}`}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 font-bold text-sm transition-colors"
                            >
                              −
                            </button>
                            <span
                              className="w-6 text-center text-sm font-semibold text-gray-700"
                              aria-label={`Quantity: ${item.quantity}`}
                            >
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(item, 1)}
                              aria-label={`Increase quantity of ${item.product.name}`}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                            >
                              +
                            </button>
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item)}
                            aria-label={`Remove ${item.product.name} from list`}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Inline item error */}
                        {itemErrors[item.id] && (
                          <p role="alert" className="mt-1 text-xs text-red-600 pl-7">
                            {itemErrors[item.id]}
                          </p>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Add item modal                                                       */}
      {/* ------------------------------------------------------------------ */}
      {addModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Add item to ${addModal.storeName ?? 'Unassigned'}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAddModal()
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                Add item to {addModal.storeName ?? 'Unassigned'}
              </h2>
              <button
                type="button"
                onClick={closeAddModal}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {/* Add error */}
              {addError && (
                <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                  {addError}
                </div>
              )}

              {catalogLoading && (
                <p className="text-sm text-gray-500 animate-pulse text-center py-4">
                  Loading catalog…
                </p>
              )}

              {catalogError && (
                <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                  {catalogError}
                </div>
              )}

              {!catalogLoading && !catalogError && catalog.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No products in catalog yet.{' '}
                  <Link
                    to="/catalog"
                    className="text-blue-600 hover:underline"
                    onClick={closeAddModal}
                  >
                    Add products first.
                  </Link>
                </p>
              )}

              {!catalogLoading &&
                catalog.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleAddProduct(product)}
                    disabled={addingProductId === product.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-green-300 hover:bg-green-50 transition-colors text-left disabled:opacity-60"
                  >
                    {/* Thumbnail */}
                    {product.photo_url ? (
                      <img
                        src={product.photo_url}
                        alt={product.name}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0"
                        aria-hidden="true"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                        </svg>
                      </div>
                    )}

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {product.name}
                      </p>
                      {product.brand && (
                        <p className="text-xs text-gray-500 truncate">{product.brand}</p>
                      )}
                    </div>

                    {/* Loading spinner or add icon */}
                    {addingProductId === product.id ? (
                      <svg className="h-4 w-4 text-green-600 animate-spin flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
