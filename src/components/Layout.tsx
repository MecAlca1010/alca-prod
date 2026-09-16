import { Link } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import AssistantPanel from './AssistantPanel'
import NotificationBell from './NotificationBell'

interface LayoutProps {
  children: React.ReactNode
  session: Session | null
  setSession: (session: Session | null) => void
  role?: 'admin' | 'tech' | null
}

export default function Layout({ children, session, setSession, role }: LayoutProps) {
  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAssistant, setShowAssistant] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      setSession(data.session)
      setShowLogin(false)
    }
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-alca-black text-white shadow-md">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="bg-alca-yellow text-alca-black font-black text-xl px-3 py-1 rounded">
              ALCA
            </div>
            <span className="font-black text-xl tracking-tight">Prod</span>
          </Link>

          <div className="flex items-center gap-3">
            <NotificationBell enabled={role === 'admin'} />
            <button
              type="button"
              onClick={() => setShowAssistant(true)}
              className="text-sm bg-alca-gray hover:bg-gray-600 px-3 py-1.5 rounded transition"
              title="Assistant production"
            >
              Assistant
            </button>
            {session ? (
              <>
                <span className="text-sm text-gray-300 hidden sm:inline">
                  {role === 'tech' ? 'Mode Tech' : 'Mode Admin'}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm bg-alca-gray hover:bg-gray-600 px-3 py-1.5 rounded transition"
                >
                  Déconnexion
                </button>
                {role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setShowMenu(true)}
                    className="w-9 h-9 flex flex-col items-center justify-center gap-1 rounded hover:bg-alca-gray"
                    title="Menu"
                    aria-label="Menu"
                  >
                    <span className="block w-4 h-0.5 bg-white" />
                    <span className="block w-4 h-0.5 bg-white" />
                    <span className="block w-4 h-0.5 bg-white" />
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="text-sm bg-alca-yellow text-alca-black font-black px-4 py-1.5 rounded hover:brightness-110 transition"
              >
                Connexion Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-4 py-6">
        {children}
      </main>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-2xl font-black mb-6">Connexion Admin</h2>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-alca-yellow"
                  required
                />
              </div>

              {error && (
                <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogin(false)}
                  className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-alca-yellow text-alca-black font-black py-2 rounded-lg hover:brightness-110 transition disabled:opacity-50"
                >
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMenu && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[70]" onClick={() => setShowMenu(false)} />
          <aside className="fixed top-0 right-0 h-full w-72 bg-alca-black text-white z-[80] shadow-2xl p-5">
            <div className="flex justify-between items-center mb-6">
              <span className="font-black">Menu</span>
              <button onClick={() => setShowMenu(false)} className="text-2xl leading-none">×</button>
            </div>
            <nav className="space-y-1 text-sm">
              {[
                ['/composants', 'Composants'],
                ['/modeles-hiab', 'Modèles Hiab'],
                ['/regles', 'Règles'],
                ['/techniciens', 'Techniciens'],
                ['/planning', 'Planning par étape'],
              ].map(([to, label]) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setShowMenu(false)}
                  className="block px-3 py-2 rounded hover:bg-alca-gray"
                >
                  {label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false)
                  window.dispatchEvent(new CustomEvent('alca-open-durations'))
                }}
                className="w-full text-left px-3 py-2 rounded hover:bg-alca-gray"
              >
                Durées des étapes
              </button>
            </nav>
          </aside>
        </>
      )}

      <AssistantPanel
        open={showAssistant}
        onClose={() => setShowAssistant(false)}
        isAdmin={role === 'admin'}
      />
    </div>
  )
}
