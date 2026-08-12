import { Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import Dashboard from './pages/Dashboard'
import ProjectDetail from './pages/ProjectDetail'
import ComponentsPage from './pages/ComponentsPage'
import Layout from './components/Layout'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-alca-gray text-white">
        <div className="text-xl font-black">ALCA Prod</div>
      </div>
    )
  }

  return (
    <Layout session={session} setSession={setSession}>
      <Routes>
        <Route path="/" element={<Dashboard isAdmin={!!session} />} />
        <Route path="/projet/:id" element={<ProjectDetail isAdmin={!!session} />} />
        <Route path="/composants" element={<ComponentsPage isAdmin={!!session} />} />
      </Routes>
    </Layout>
  )
}

export default App
