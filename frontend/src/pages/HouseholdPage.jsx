import { useState } from 'react'
import apiClient from '../services/apiClient'
import useAuthStore from '../store/authStore'

export default function HouseholdPage() {
  const householdId = useAuthStore((s) => s.householdId)

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleInvite(e) {
    e.preventDefault()
    setError('')
    setInviteLink('')
    setLoading(true)

    try {
      const { data } = await apiClient.post('/api/auth/households/invite', { email })
      // Build the invite link using the token returned by the backend
      const link = `${window.location.origin}/household/setup?token=${data.token}`
      setInviteLink(link)
      setEmail('')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Failed to generate invite. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: select the text
      const el = document.getElementById('invite-link-text')
      if (el) {
        el.select()
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Grocery Getter household',
          text: 'Click the link to join my household on Grocery Getter.',
          url: inviteLink,
        })
      } catch {
        // User cancelled share — ignore
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-800">Household</h1>

        {/* Invite card */}
        <div className="bg-white rounded-2xl shadow-md p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Invite a member</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter their email to generate an invite link. Send it to them — they'll register and join your household automatically.
            </p>
          </div>

          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="wife@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Generating…' : 'Generate invite link'}
            </button>
          </form>

          {/* Invite link result */}
          {inviteLink && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700">Invite link ready — share it:</p>

              <div className="flex gap-2">
                <input
                  id="invite-link-text"
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-shrink-0 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
                  aria-label="Copy invite link"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              {/* Native share button — only shown if Web Share API is available */}
              {typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={handleShare}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share via…
                </button>
              )}

              <p className="text-xs text-gray-400">
                Link expires in 7 days. They'll need to register or log in when they open it.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
