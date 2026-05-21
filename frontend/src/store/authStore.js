import { create } from 'zustand'

const useAuthStore = create((set) => ({
  token: localStorage.getItem('token') || null,
  userId: null,
  householdId: null,

  login: (token) => {
    localStorage.setItem('token', token)
    // Decode JWT payload without an extra library dependency
    const payload = JSON.parse(atob(token.split('.')[1]))
    set({ token, userId: payload.sub, householdId: payload.household_id })
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, userId: null, householdId: null })
  },
}))

export default useAuthStore
