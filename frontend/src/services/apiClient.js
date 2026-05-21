import axios from 'axios'

const apiClient = axios.create({
  // In production, set VITE_API_URL to your Railway backend URL.
  // Falls back to localhost for local development.
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// Inject JWT from localStorage on every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401: clear token and redirect to /login
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
