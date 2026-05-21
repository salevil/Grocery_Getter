import { render, screen, waitFor } from '@testing-library/react'
import { vi, test, expect, afterEach } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

// Validates: Requirements 2.4, 2.6
test('calls the correct API URL on mount and shows loading indicator initially', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message: 'Hello World' }),
  })

  render(<App />)

  // Loading indicator is shown while fetch is in-flight (Req 2.6)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()

  // Fetch is called with the correct URL (Req 2.4)
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/api/hello')

  // Wait for the component to settle
  await waitFor(() => screen.getByText('Hello World'))
})

// Validates: Requirements 2.5
test('displays the message from the API response on success', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message: 'Hello World' }),
  })

  render(<App />)

  await waitFor(() => {
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })
})

// Validates: Requirements 2.7
test('displays a human-readable error when fetch rejects (network error)', async () => {
  global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))

  render(<App />)

  await waitFor(() => {
    expect(screen.getByText('Network error. Is the backend running?')).toBeInTheDocument()
  })
})

// Validates: Requirements 2.7
test('displays a human-readable error when response is non-2xx', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
  })

  render(<App />)

  await waitFor(() => {
    expect(screen.getByText('Failed to fetch greeting.')).toBeInTheDocument()
  })
})
