import { drain } from './offlineQueue'
import apiClient from './apiClient'

let socket = null
let reconnectTimer = null
let reconnectDelay = 1000
const MAX_DELAY = 30000

let _storeId = null
let _token = null
let _onEvent = null

function connect(storeId, token, onEvent) {
  _storeId = storeId
  _token = token
  _onEvent = onEvent

  _connect()
}

function _connect() {
  if (socket) {
    socket.onclose = null
    socket.close()
  }

  // Derive WebSocket URL from the API URL env var, or fall back to localhost.
  // Replaces http(s):// with ws(s)://
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const wsBase = apiBase.replace(/^http/, 'ws')
  const url = `${wsBase}/ws/lists/${_storeId}?token=${_token}`
  socket = new WebSocket(url)

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (_onEvent) _onEvent(data)
    } catch {
      if (_onEvent) _onEvent(event.data)
    }
  }

  socket.onopen = () => {
    // If reconnectDelay > 1000 this is a reconnect (backoff has grown), drain the queue
    if (reconnectDelay > 1000) {
      drain(apiClient)
    }
    // Reset backoff on successful connection
    reconnectDelay = 1000
  }

  socket.onclose = (event) => {
    // Don't reconnect if closed intentionally (code 1000)
    if (event.code === 1000) return

    scheduleReconnect()
  }

  socket.onerror = () => {
    // onerror is always followed by onclose, so reconnect is handled there
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    _connect()
    // Exponential backoff: double the delay, cap at MAX_DELAY
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY)
  }, reconnectDelay)
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  if (socket) {
    socket.onclose = null
    socket.close(1000, 'Intentional disconnect')
    socket = null
  }

  reconnectDelay = 1000
}

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(typeof message === 'string' ? message : JSON.stringify(message))
  } else {
    console.warn('wsClient: cannot send, socket is not open')
  }
}

export { connect, disconnect, send }
