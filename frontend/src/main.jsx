import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom'
import './index.css'

import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import HouseholdSetupPage from './pages/HouseholdSetupPage.jsx'
import CatalogPage from './pages/CatalogPage.jsx'
import StoreManagerPage from './pages/StoreManagerPage.jsx'
import ShoppingListPage from './pages/ShoppingListPage.jsx'
import ShoppingModePage from './pages/ShoppingModePage.jsx'

// Auth guard: redirect to /login if no token in localStorage
function RequireAuth() {
  const token = localStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route element={<RequireAuth />}>
          <Route path="/household/setup" element={<HouseholdSetupPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/stores" element={<StoreManagerPage />} />
          <Route path="/lists" element={<ShoppingListPage />} />
          <Route path="/lists/:storeId/shop" element={<ShoppingModePage />} />
          <Route path="/" element={<Navigate to="/lists" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
