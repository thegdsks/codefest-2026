import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, LogIn } from 'lucide-react'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-lg">Codefest 2026</span>
          <nav className="flex items-center gap-4">
            <NavLink
              to="/login"
              className={({ isActive }) =>
                `flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              <LogIn size={15} />
              Login
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-1.5 text-sm px-3 py-1.5 rounded transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              <LayoutDashboard size={15} />
              Dashboard
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
