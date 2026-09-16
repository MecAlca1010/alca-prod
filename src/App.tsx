import { Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import Dashboard from './pages/Dashboard'
import ProjectDetail from './pages/ProjectDetail'
import ComponentsPage from './pages/ComponentsPage'
import HiabModelsPage from './pages/HiabModelsPage'
import RulesPage from './pages/RulesPage'
import TechniciansPage from './pages/TechniciansPage'
import DeliveredPage from './pages/DeliveredPage'
import Layout from './components/Layout'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<'admin' | 'tech' | null>(null)
  const [loading, setLoading] = useState(true)

  const loadRole = async (sess: Session | null) => {
    if (!sess?.user) {
      setRole(null)
      return
    }
    const { data } = await supabase.from('profiles').select('role').eq('id', sess.user.id).maybeSingle()
    const r = (data as any)?.role
    if (r === 'admin' || r === 'tech') setRole(r)
    else {
      const email = (sess.user.email || '').toLowerCase()
      if (email === 'production@mecanoalca.ca') setRole('tech')
      else setRole('admin')
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      loadRole(session).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      loadRole(session)
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
    <Layout session={session} setSession={setSession} role={role}>
      <Routes>
        <Route path="/" element={<Dashboard isAdmin={role === 'admin'} />} />
        <Route path="/projet/:id" element={<ProjectDetail isAdmin={role === 'admin'} isTech={role === 'tech'} />} />
        <Route path="/composants" element={<ComponentsPage isAdmin={role === 'admin'} />} />
        <Route path="/modeles-hiab" element={<HiabModelsPage isAdmin={role === 'admin'} />} />
        <Route path="/regles" element={<RulesPage isAdmin={role === 'admin'} />} />
        <Route path="/techniciens" element={<TechniciansPage isAdmin={role === 'admin'} />} />
        <Route path="/livres" element={<DeliveredPage isAdmin={role === 'admin'} />} />
      </Routes>
    </Layout>
  )
}

export default App
