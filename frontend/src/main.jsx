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
import './i18n/index.js'

import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import HouseholdSetupPage from './pages/HouseholdSetupPage.jsx'
import CatalogPage from './pages/CatalogPage.jsx'
import StoreManagerPage from './pages/StoreManagerPage.jsx'
import ShoppingListPage from './pages/ShoppingListPage.jsx'
import ShoppingModePage from './pages/ShoppingModePage.jsx'
import HouseholdPage from './pages/HouseholdPage.jsx'
import PantryPage from './pages/PantryPage.jsx'
import BottomNav from './components/BottomNav.jsx'
import TopBar from './components/TopBar.jsx'

// Auth guard: redirect to /login if no token in localStorage
function RequireAuth() {
  const token = localStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return (
    <>
      <TopBar />
      {/* pt-14 = TopBar height, pb-16 = BottomNav height */}
      <div className="pt-14 pb-16">
        <Outlet />
      </div>
      <BottomNav />
    </>
  )
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
          <Route path="/household" element={<HouseholdPage />} />
          <Route path="/pantry" element={<PantryPage />} />
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
