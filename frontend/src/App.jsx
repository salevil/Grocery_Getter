import { useState, useEffect } from 'react'

function App() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    const fetchGreeting = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/hello')
        if (!response.ok) {
          setState({ status: 'error', message: 'Failed to fetch greeting.' })
          return
        }
        const data = await response.json()
        setState({ status: 'success', message: data.message })
      } catch {
        setState({ status: 'error', message: 'Network error. Is the backend running?' })
      }
    }

    fetchGreeting()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        {state.status === 'loading' && (
          <p className="text-lg text-gray-500 animate-pulse">Loading...</p>
        )}
        {state.status === 'success' && (
          <h1 className="text-4xl font-bold text-gray-800">{state.message}</h1>
        )}
        {state.status === 'error' && (
          <p className="text-lg text-red-500">{state.message}</p>
        )}
      </div>
    </div>
  )
}

export default App
