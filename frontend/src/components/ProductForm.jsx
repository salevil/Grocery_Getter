import { useState } from 'react'
import apiClient from '../services/apiClient'

/**
 * ProductForm
 *
 * Handles both CREATE and EDIT modes for a catalog product.
 *
 * Props:
 *   initialValues  — { id?, name?, brand?, quantity?, store_id?, upc? }
 *                    When `id` is present the form operates in EDIT mode.
 *   stores         — Array of { id, name } objects for the preferred-store dropdown.
 *   onSuccess(product) — Called with the saved product after a successful submit.
 *   onCancel()     — Called when the user dismisses the form without saving.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 11.2
 */
export default function ProductForm({ initialValues = {}, stores = [], onSuccess, onCancel }) {
  const isEdit = Boolean(initialValues.id)

  const [name, setName] = useState(initialValues.name ?? '')
  const [brand, setBrand] = useState(initialValues.brand ?? '')
  const [quantity, setQuantity] = useState(initialValues.quantity ?? '')
  const [storeId, setStoreId] = useState(initialValues.store_id ?? '')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
        if (initialValues.upc) formData.append('upc', initialValues.upc)
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

      {/* Preferred Store */}
      <div>
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
    </form>
  )
}
