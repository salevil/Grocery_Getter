import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import apiClient from '../services/apiClient'

const CATEGORIES = [
  'Produce',
  'Dairy & Eggs',
  'Meat',
  'Fish & Seafood',
  'Deli & Charcuterie',
  'Bread & Bakery',
  'Frozen',
  'Canned & Jarred',
  'Pasta, Rice & Grains',
  'Sauces & Condiments',
  'Breakfast & Cereals',
  'Snacks & Sweets',
  'Beverages',
  'Dairy Alternatives',
  'Baby & Kids',
  'Health & Pharmacy',
  'Cleaning',
  'Personal Care',
  'Pet',
  'Other',
]

const CATEGORY_GUIDE = [
  { name: 'Produce',              desc: 'Fresh fruit & vegetables' },
  { name: 'Dairy & Eggs',         desc: 'Milk, cheese, yogurt, eggs' },
  { name: 'Meat',                 desc: 'Beef, pork, lamb, poultry' },
  { name: 'Fish & Seafood',       desc: 'Fresh, smoked, tinned fish' },
  { name: 'Deli & Charcuterie',   desc: 'Cold cuts, pâté, prepared meats' },
  { name: 'Bread & Bakery',       desc: 'Bread, pastries, wraps' },
  { name: 'Frozen',               desc: 'Everything frozen' },
  { name: 'Canned & Jarred',      desc: 'Tinned tomatoes, beans, jams, pickles' },
  { name: 'Pasta, Rice & Grains', desc: 'Dry pasta, rice, couscous, lentils' },
  { name: 'Sauces & Condiments',  desc: "Ketchup, mustard, olive oil, vinegar, spices" },
  { name: 'Breakfast & Cereals',  desc: 'Cereal, oats, granola, spreads' },
  { name: 'Snacks & Sweets',      desc: 'Crisps, chocolate, biscuits, nuts' },
  { name: 'Beverages',            desc: 'Water, juice, coffee, tea, alcohol' },
  { name: 'Dairy Alternatives',   desc: 'Oat milk, soy yogurt, vegan cheese' },
  { name: 'Baby & Kids',          desc: 'Baby food, nappies' },
  { name: 'Health & Pharmacy',    desc: 'Vitamins, medicine' },
  { name: 'Cleaning',             desc: 'Detergent, bleach, bin bags' },
  { name: 'Personal Care',        desc: 'Shampoo, soap, toothpaste' },
  { name: 'Pet',                  desc: 'Pet food, litter' },
  { name: 'Other',                desc: "Anything that doesn't fit above" },
]

export default function ProductForm({ initialValues = {}, stores = [], onSuccess, onCancel }) {
  const isEdit = Boolean(initialValues.id)
  const { t } = useTranslation()

  const [name, setName] = useState(initialValues.name ?? '')
  const [brand, setBrand] = useState(initialValues.brand ?? '')
  const [quantity, setQuantity] = useState(initialValues.quantity ?? '')
  const [upc, setUpc] = useState(initialValues.upc ?? '')
  const [storeId, setStoreId] = useState(initialValues.store_id ?? '')
  const [category, setCategory] = useState(initialValues.category ?? '')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [categoryGuideOpen, setCategoryGuideOpen] = useState(false)

  // Req 11.2: client-side photo validation — JPEG/PNG only, ≤ 5 MB
  function handlePhotoChange(e) {
    setPhotoError('')
    const file = e.target.files?.[0]
    if (!file) {
      setPhotoFile(null)
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      setPhotoError('Only JPEG and PNG photos are accepted.')
      e.target.value = ''
      setPhotoFile(null)
      return
    }

    const maxBytes = 5 * 1024 * 1024 // 5 MB
    if (file.size > maxBytes) {
      setPhotoError('Photo must be 5 MB or smaller.')
      e.target.value = ''
      setPhotoFile(null)
      return
    }

    setPhotoFile(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError('')

    if (photoError) return // block submit if photo validation failed

    setSubmitting(true)
    try {
      let data

      if (isEdit) {
        // For edits: send fields as JSON, then upload photo separately if provided
        const body = {}
        if (name) body.name = name
        if (brand !== '') body.brand = brand || null
        if (quantity !== '') body.quantity = quantity || null
        body.store_id = storeId !== '' ? Number(storeId) : null
        body.category = category || null
        body.upc = upc || null
        const res = await apiClient.patch(`/api/catalog/products/${initialValues.id}`, body)
        data = res.data

        // If a new photo was selected, upload it separately
        if (photoFile) {
          const photoForm = new FormData()
          photoForm.append('photo', photoFile)
          const photoRes = await apiClient.post(
            `/api/catalog/products/${initialValues.id}/photo`,
            photoForm,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          )
          data = photoRes.data
        }
      } else {
        // Req 4.1, 4.2, 4.3: POST as multipart/form-data for creates
        const formData = new FormData()
        formData.append('name', name)
        if (brand) formData.append('brand', brand)
        if (quantity) formData.append('quantity', quantity)
        if (storeId !== '') formData.append('store_id', String(storeId))
        if (upc) formData.append('upc', upc)
        if (category) formData.append('category', category)
        if (photoFile) formData.append('photo', photoFile)

        const res = await apiClient.post('/api/catalog/products', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        data = res.data
      }

      onSuccess(data)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setServerError(detail)
      } else if (Array.isArray(detail)) {
        setServerError(detail.map((d) => d.msg).join(', '))
      } else {
        setServerError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name — required */}
      <div>
        <label htmlFor="pf-name" className="block text-sm font-medium text-gray-700 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="pf-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="e.g. Whole Milk"
        />
      </div>

      {/* Brand */}
      <div>
        <label htmlFor="pf-brand" className="block text-sm font-medium text-gray-700 mb-1">
          Brand
        </label>
        <input
          id="pf-brand"
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="e.g. Organic Valley"
        />
      </div>

      {/* Quantity / Weight */}
      <div>
        <label htmlFor="pf-quantity" className="block text-sm font-medium text-gray-700 mb-1">
          Quantity / Weight
        </label>
        <input
          id="pf-quantity"
          type="text"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="e.g. 1 gallon"
        />
      </div>

      {/* Barcode / UPC */}
      <div>
        <label htmlFor="pf-upc" className="block text-sm font-medium text-gray-700 mb-1">
          Barcode (UPC)
        </label>
        <input
          id="pf-upc"
          type="text"
          value={upc}
          onChange={(e) => setUpc(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
          placeholder="e.g. 012345678905"
        />
        <p className="mt-1 text-xs text-gray-400">Used to match scans in the pantry and shopping mode.</p>
      </div>

      {/* Preferred Store */}      <div>
        <label htmlFor="pf-store" className="block text-sm font-medium text-gray-700 mb-1">
          Preferred Store
        </label>
        <select
          id="pf-store"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="">— None —</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Category */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label htmlFor="pf-category" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <button
            type="button"
            onClick={() => setCategoryGuideOpen(true)}
            aria-label="Category guide"
            className="w-4 h-4 rounded-full bg-gray-300 hover:bg-gray-400 text-white text-xs font-bold flex items-center justify-center transition-colors flex-shrink-0"
          >
            ?
          </button>
        </div>
        <select
          id="pf-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="">— None —</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Photo — shown in both create and edit mode */}
      <div>
        <label htmlFor="pf-photo" className="block text-sm font-medium text-gray-700 mb-1">
          {isEdit ? 'Replace photo' : 'Photo'}
        </label>
        {isEdit && initialValues.photo_url && (
          <img
            src={initialValues.photo_url}
            alt="Current product photo"
            className="w-16 h-16 rounded-lg object-cover mb-2 bg-gray-100"
          />
        )}
        <input
          id="pf-photo"
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={handlePhotoChange}
          className="w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
        />
        {photoError && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {photoError}
          </p>
        )}
      </div>

      {/* Server error */}
      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || Boolean(photoError)}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
        >
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg transition-colors text-sm"
        >
          Cancel
        </button>
      </div>

      {/* Category guide modal */}
      {categoryGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Category guide"
          onClick={(e) => { if (e.target === e.currentTarget) setCategoryGuideOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Category guide</h2>
              <button
                type="button"
                onClick={() => setCategoryGuideOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="pb-2 font-semibold w-2/5">Category</th>
                    <th className="pb-2 font-semibold">What goes in it</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {CATEGORY_GUIDE.map((row) => (
                    <tr key={row.name}>
                      <td className="py-2 pr-3 font-medium text-gray-700 align-top">{row.name}</td>
                      <td className="py-2 text-gray-500 align-top">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
