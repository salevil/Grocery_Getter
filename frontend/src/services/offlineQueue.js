const QUEUE_KEY = 'offlineQueue'

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

/**
 * Enqueue a request to be replayed when back online.
 * @param {{ url: string, method: string, body: any }} request
 */
function enqueue(request) {
  const queue = getQueue()
  queue.push({
    url: request.url,
    method: request.method,
    body: request.body,
    timestamp: Date.now(),
  })
  saveQueue(queue)
}

/**
 * Replay all queued requests in order.
 * Discards entries that return 4xx responses.
 * Clears the queue on completion.
 * @param {import('axios').AxiosInstance} apiClient
 */
async function drain(apiClient) {
  const queue = getQueue()
  if (queue.length === 0) return

  // Clear the queue immediately to avoid double-draining on concurrent calls
  saveQueue([])

  for (const entry of queue) {
    try {
      await apiClient({
        url: entry.url,
        method: entry.method,
        data: entry.body,
      })
    } catch (error) {
      const status = error.response?.status
      if (status && status >= 400 && status < 500) {
        // Discard 4xx errors — these are client errors that won't succeed on retry
        console.warn(`offlineQueue: discarding ${entry.method} ${entry.url} (${status})`)
      } else {
        // For network errors or 5xx, re-enqueue and stop draining
        const remaining = getQueue()
        saveQueue([entry, ...remaining])
        break
      }
    }
  }
}

/**
 * Initialize the offline queue listeners.
 * Automatically drains the queue when the browser comes back online.
 * @param {import('axios').AxiosInstance} apiClient
 */
function initOfflineQueue(apiClient) {
  window.addEventListener('online', () => {
    drain(apiClient)
  })

  window.addEventListener('offline', () => {
    // Nothing to do on going offline — requests will be enqueued by callers
  })
}

export { enqueue, drain, initOfflineQueue }
