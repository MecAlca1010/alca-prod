import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project } from '../types/database'

export default function DeliveredPage({ isAdmin }: { isAdmin: boolean }) {
  const [projects, setProjects] = useState<Project[]>([])

  const load = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('is_closed', true)
      .order('closed_at', { ascending: false })
    setProjects((data || []) as Project[])
  }
  useEffect(() => {
    load()
  }, [])

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link to="/" className="text-sm text-gray-500 hover:text-black">
        ← Tableau de bord
      </Link>
      <h1 className="text-3xl font-black">Projets livrés</h1>
      {projects.length === 0 && <p className="text-gray-400 text-sm">Aucun projet fermé.</p>}
      <div className="bg-white border rounded-xl divide-y">
        {projects.map((p) => (
          <Link key={p.id} to={`/projet/${p.id}`} className="block px-4 py-3 hover:bg-gray-50">
            <div className="font-medium">
              {p.project_number} — {p.client_name}
            </div>
            <div className="text-xs text-gray-500">
              Fermé {p.closed_at ? p.closed_at.slice(0, 10) : ''}
              {p.estimated_delivery_date ? ` · liv. estimée ${p.estimated_delivery_date}` : ''}
            </div>
          </Link>
        ))}
      </div>
      {isAdmin && <p className="text-xs text-gray-400">Ouvre une fiche pour consulter ou réouvrir.</p>}
    </div>
  )
}
