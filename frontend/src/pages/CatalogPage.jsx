import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import apiClient from '../services/apiClient'
import BarcodeScanner from '../components/BarcodeScanner'
import ProductForm from '../components/ProductForm'

/**
 * CatalogPage
 *
 * Displays the household product catalog and provides:
 *   - Product grid with thumbnail, name, brand, preferred store
 *   - "Add product" button → ProductForm in create mode
 *   - "Scan barcode" button → BarcodeScanner → UPC lookup flow
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 4.4
 */
export default function CatalogPage() {
  const { t } = useTranslation()
  const [products, setProducts] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // UI mode: 'list' | 'add' | 'scan' | 'scan-found' | 'scan-prefill'
  const [mode, setMode] = useState('list')

  // Barcode scan state
  const [scanResult, setScanResult] = useState(null) // { found, product?, prefill?, upc }
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')

  // Edit mode
  const [editProduct, setEditProduct] = useState(null)

  // Add-to-list feedback
  const [addedToList, setAddedToList] = useState(null) // product id that was just added

  // Delete feedback
  const [deleteError, setDeleteError] = useState('')

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoadError('')
    try {
      const [productsRes, storesRes] = await Promise.all([
        apiClient.get('/api/catalog/products'),
        apiClient.get('/api/catalog/stores'),
      ])
      setProducts(productsRes.data)
      setStores(storesRes.data)
    } catch {
      setLoadError('Failed to load catalog. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function storeNameById(id) {
    if (!id) return null
    return stores.find((s) => s.id === id)?.name ?? null
  }

  // -------------------------------------------------------------------------
  // Barcode scan flow
  // -------------------------------------------------------------------------

  async function handleScan(upc) {
    setMode('list') // hide scanner UI while we look up
    setScanLoading(true)
    setScanError('')
    try {
      const { data } = await apiClient.get(`/api/catalog/lookup/${upc}`)
      setScanResult({ ...data, upc })

      if (data.found) {
        // Req 3.7: product already in catalog — offer "Add to list"
        setMode('scan-found')
      } else if (data.prefill) {
        // Req 3.4: OFF returned data — open form pre-filled
        setMode('scan-prefill')
      } else {
        // Req 3.5 / 3.6: no match — open form with UPC pre-filled
        setMode('scan-prefill')
      }
    } catch {
      setScanError('Barcode lookup failed. Please try again.')
      setMode('list')
    } finally {
      setScanLoading(false)
    }
  }

  async function handleAddToList(product) {
    try {
      await apiClient.post('/api/lists/items', { product_id: product.id, quantity: 1 })
      setAddedToList(product.id)
      setTimeout(() => setAddedToList(null), 2500)
    } catch {
      // non-critical — silently ignore
    }
    setMode('list')
    setScanResult(null)
  }

  // -------------------------------------------------------------------------
  // Form callbacks
  // -------------------------------------------------------------------------

  function handleProductSaved() {
    setMode('list')
    setEditProduct(null)
    setScanResult(null)
    loadData()
  }

  function handleFormCancel() {
    setMode('list')
    setEditProduct(null)
    setScanResult(null)
  }

  async function handleDeleteProduct(product) {
    if (!window.confirm(`Delete "${product.name}" from your catalog? This cannot be undone.`)) return
    setDeleteError('')
    try {
      await apiClient.delete(`/api/catalog/products/${product.id}`)
      loadData()
    } catch {
      setDeleteError(`Failed to delete ${product.name}. Please try again.`)
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function buildFormInitialValues() {
    if (editProduct) return editProduct
    if (scanResult?.prefill) {
      return {
        name: scanResult.prefill.name ?? '',
        brand: scanResult.prefill.brand ?? '',
        quantity: scanResult.prefill.quantity ?? '',
        upc: scanResult.upc,
      }
    }
    // No prefill — just seed the UPC
    return { upc: scanResult?.upc ?? '' }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Loading catalog…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-800">Product Catalog</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMode('scan'); setScanError('') }}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                <line x1="7" y1="8" x2="7" y2="16" strokeWidth={2} />
                <line x1="10" y1="8" x2="10" y2="16" strokeWidth={2} />
                <line x1="13" y1="8" x2="13" y2="16" strokeWidth={2} />
                <line x1="16" y1="8" x2="16" y2="16" strokeWidth={2} />
              </svg>
              Scan barcode
            </button>
            <button
              type="button"
              onClick={() => setMode('add')}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add product
            </button>
          </div>
        </div>

        {/* Load error */}
        {loadError && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {loadError}
          </div>
        )}

        {/* Scan loading indicator */}
        {scanLoading && (
          <div className="rounded-md bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 text-sm animate-pulse">
            Looking up barcode…
          </div>
        )}

        {/* Scan error */}
        {scanError && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {scanError}
          </div>
        )}

        {/* Added-to-list toast */}
        {addedToList && (
          <div role="status" className="rounded-md bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm">
            Added to your shopping list.
          </div>
        )}

        {/* Delete error */}
        {deleteError && (
          <div role="alert" className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {deleteError}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Barcode Scanner overlay                                           */}
        {/* ---------------------------------------------------------------- */}
        {mode === 'scan' && (
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Scan a barcode</h2>
            <BarcodeScanner
              onScan={handleScan}
              onClose={() => setMode('list')}
            />
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Scan found — existing product                                     */}
        {/* ---------------------------------------------------------------- */}
        {mode === 'scan-found' && scanResult?.product && (
          <div className="bg-white rounded-2xl shadow-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Product found in catalog</h2>
            <ProductCard
              product={scanResult.product}
              storeName={storeNameById(scanResult.product.store_id)}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleAddToList(scanResult.product)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
              >
                Add to list
              </button>
              <button
                type="button"
                onClick={() => { setMode('list'); setScanResult(null) }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Add product form (manual or post-scan prefill)                   */}
        {/* ---------------------------------------------------------------- */}
        {(mode === 'add' || mode === 'scan-prefill') && (
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              {mode === 'scan-prefill' ? 'New product from scan' : 'Add product'}
            </h2>
            <ProductForm
              initialValues={buildFormInitialValues()}
              stores={stores}
              onSuccess={handleProductSaved}
              onCancel={handleFormCancel}
            />
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Edit product form                                                 */}
        {/* ---------------------------------------------------------------- */}
        {mode === 'edit' && editProduct && (
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Edit product</h2>
            <ProductForm
              initialValues={editProduct}
              stores={stores}
              onSuccess={handleProductSaved}
              onCancel={handleFormCancel}
            />
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Product grid — grouped by category                               */}
        {/* ---------------------------------------------------------------- */}
        {mode === 'list' && (
          <>
            {products.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-md p-8 text-center text-gray-500">
                <p className="text-lg font-medium">No products yet</p>
                <p className="text-sm mt-1">Add your first product using the buttons above.</p>
              </div>
            ) : (
              (() => {
                // Group products by category
                const grouped = {}
                products.forEach((p) => {
                  const cat = p.category || 'Uncategorized'
                  if (!grouped[cat]) grouped[cat] = []
                  grouped[cat].push(p)
                })
                const sortedCats = Object.keys(grouped).sort((a, b) =>
                  a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b)
                )
                return (
                  <div className="space-y-4">
                    {sortedCats.map((cat) => (
                      <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{cat}</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y divide-gray-50">
                          {grouped[cat].map((product) => (
                            <div key={product.id} className="p-4 flex gap-4 items-start">
                              {product.photo_url ? (
                                <img src={product.photo_url} alt={product.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                              ) : (
                                <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 3H8l-2 4h12l-2-4z" />
                                  </svg>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 truncate">{product.name}</p>
                                {product.brand && <p className="text-sm text-gray-500 truncate">{product.brand}</p>}
                                {product.quantity && <p className="text-xs text-gray-400 truncate">{product.quantity}</p>}
                                {storeNameById(product.store_id) && (
                                  <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5">
                                    {storeNameById(product.store_id)}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col gap-1 flex-shrink-0">
                                <button type="button" aria-label={`Edit ${product.name}`} onClick={() => { setEditProduct(product); setMode('edit') }} className="text-gray-400 hover:text-gray-600 transition-colors">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button type="button" aria-label={`Delete ${product.name}`} onClick={() => handleDeleteProduct(product)} className="text-gray-400 hover:text-red-600 transition-colors">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()
            )}
          </>
        )}

      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small helper component — product card used in scan-found view
// ---------------------------------------------------------------------------

function ProductCard({ product, storeName }) {
  return (
    <div className="flex gap-4 items-start p-3 bg-gray-50 rounded-lg">
      {product.photo_url ? (
        <img
          src={product.photo_url}
          alt={product.name}
          className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100"
        />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800">{product.name}</p>
        {product.brand && <p className="text-sm text-gray-500">{product.brand}</p>}
        {product.quantity && <p className="text-xs text-gray-400">{product.quantity}</p>}
        {storeName && (
          <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5">
            {storeName}
          </span>
        )}
      </div>
    </div>
  )
}
