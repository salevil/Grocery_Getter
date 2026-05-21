import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import apiClient from '../services/apiClient'
import useAuthStore from '../store/authStore'

export default function HouseholdSetupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)

  const [householdName, setHouseholdName] = useState('')
  const [createError, setCreateError] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  const [joinStatus, setJoinStatus] = useState('idle') // 'idle' | 'loading' | 'error'
  const [joinError, setJoinError] = useState('')

  const inviteToken = searchParams.get('token')

  // Requirement 2.4: auto-join when ?token= is present in the URL
  useEffect(() => {
    if (!inviteToken) return

    async function joinHousehold() {
      setJoinStatus('loading')
      try {
        const { data } = await apiClient.get(`/api/auth/households/join/${inviteToken}`)
        login(data.token.access_token)
        navigate('/catalog')
      } catch (err) {
        const detail = err.response?.data?.detail
        setJoinError(
          typeof detail === 'string' ? detail : 'The invitation link is invalid or has expired.'
        )
        setJoinStatus('error')
      }
    }

    joinHousehold()
  }, [inviteToken, login, navigate])

  // Requirement 2.1: create a new household
  async function handleCreate(e) {
    e.preventDefault()
    setCreateError('')
    setCreateLoading(true)

    try {
      const { data } = await apiClient.post('/api/auth/households', { name: householdName })
      login(data.token.access_token)
      navigate('/catalog')
    } catch (err) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setCreateError(detail)
      } else {
        setCreateError('Failed to create household. Please try again.')
      }
    } finally {
      setCreateLoading(false)
    }
  }

  // While auto-joining via invite token
  if (inviteToken && joinStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Joining household…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">

        {/* Invitation join error banner */}
        {joinStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 font-medium">Could not join via invitation</p>
            <p className="text-sm text-red-600 mt-1">{joinError}</p>
          </div>
        )}

        {/* Create household card */}
        <div className="bg-white rounded-2xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Set up your household</h1>
          <p className="text-sm text-gray-500 mb-6">
            Create a new household to start managing your grocery lists.
          </p>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="householdName" className="block text-sm font-medium text-gray-700 mb-1">
                Household name
              </label>
              <input
                id="householdName"
                type="text"
                required
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. The Smith Family"
              />
            </div>

            {createError && (
              <p role="alert" className="text-sm text-red-600">
                {createError}
              </p>
            )}

            <button
              type="submit"
              disabled={createLoading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              {createLoading ? 'Creating…' : 'Create household'}
            </button>
          </form>
        </div>

        {/* Join via invitation card */}
        <div className="bg-white rounded-2xl shadow-md p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Join an existing household</h2>
          <p className="text-sm text-gray-500">
            If someone invited you, open the invitation link they sent you and you'll be added
            automatically.
          </p>
        </div>

      </div>
    </div>
  )
}
